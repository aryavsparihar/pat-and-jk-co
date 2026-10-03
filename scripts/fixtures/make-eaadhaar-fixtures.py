"""
Makes fake masked e-Aadhaar PDFs for tests: a made-up person, made-up digits, signed by a
made-up certificate chain marked TEST. Nothing here is real or trusted outside the tests.
"""
import datetime, io, sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import pikepdf
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pyhanko.sign import signers, fields
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko_certvalidator.registry import SimpleCertificateStore
from asn1crypto import x509 as a_x509, keys as a_keys

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
NOW = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
PASSWORD = "ASHA1990"  # the myAadhaar rule: first four letters of the name, year of birth


def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def cert(subject_cn, issuer_cn, pub, signing_key, ca, years=10):
    b = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject_cn), x509.NameAttribute(NameOID.COUNTRY_NAME, "IN")]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_cn), x509.NameAttribute(NameOID.COUNTRY_NAME, "IN")]))
        .public_key(pub)
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - datetime.timedelta(days=30))
        .not_valid_after(NOW + datetime.timedelta(days=365 * years))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    if ca:
        b = b.add_extension(x509.KeyUsage(True, False, False, False, False, True, True, False, False), critical=True)
    else:
        b = b.add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
    return b.sign(signing_key, hashes.SHA256())


root_k, sub_k, uidai_k, other_k = key(), key(), key(), key()
root = cert("TEST CCA India Root (fixtures only)", "TEST CCA India Root (fixtures only)", root_k.public_key(), root_k, True, 20)
sub = cert("TEST Licensed CA (fixtures only)", root.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value, sub_k.public_key(), root_k, True)
uidai = cert("DS Unique Identification Authority of India TEST", "TEST Licensed CA (fixtures only)", uidai_k.public_key(), sub_k, False)
stranger = cert("TEST Somebody Else", "TEST Licensed CA (fixtures only)", other_k.public_key(), sub_k, False)

(OUT / "test-root.pem").write_bytes(root.public_bytes(serialization.Encoding.PEM))


def asn(c):
    return a_x509.Certificate.load(c.public_bytes(serialization.Encoding.DER))


def page(lines):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 780
    for ln in lines:
        c.drawString(60, y, ln)
        y -= 18
    c.showPage()
    c.save()
    return buf.getvalue()


MASKED = [
    "Unique Identification Authority of India",
    "Government of India",
    "To",
    "Asha Example",
    "House 1, Example Lane, Kathua, Jammu and Kashmir 184101",
    "Asha Example",
    "DOB: 12/04/1990",
    "FEMALE",
    "XXXX XXXX 4821",
    "Aadhaar no. issued: 01/01/2020",
    "This is electronically generated letter. TEST FIXTURE, NOT A REAL DOCUMENT.",
]
UNMASKED = [l.replace("XXXX XXXX 4821", "9999 8888 4821") for l in MASKED]


def encrypted(pdf_bytes):
    src = pikepdf.open(io.BytesIO(pdf_bytes))
    out = io.BytesIO()
    src.save(out, encryption=pikepdf.Encryption(user=PASSWORD, owner="fixture-owner", R=6))
    return out.getvalue()


def sign(pdf_bytes, signer_cert, signer_key):
    w = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
    w.encrypt(PASSWORD)
    s = signers.SimpleSigner(
        signing_cert=asn(signer_cert),
        signing_key=a_keys.PrivateKeyInfo.load(signer_key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())),
        cert_registry=SimpleCertificateStore.from_certs([asn(sub), asn(root)]),
    )
    out = io.BytesIO()
    signers.sign_pdf(w, signers.PdfSignatureMetadata(field_name="Signature1"), signer=s, output=out)
    return out.getvalue()


good = sign(encrypted(page(MASKED)), uidai, uidai_k)
(OUT / "masked-signed.pdf").write_bytes(good)

# Changed after signing: an extra incremental update appended after the signature
(OUT / "masked-changed-after-signing.pdf").write_bytes(good + b"\n% appended after signing\n")

# A signed byte flipped inside the signed range (well before the signature)
tampered = bytearray(good)
i = good.find(b"stream", 200) + 20
tampered[i] = tampered[i] ^ 0x01
(OUT / "masked-tampered.pdf").write_bytes(bytes(tampered))

(OUT / "unmasked-signed.pdf").write_bytes(sign(encrypted(page(UNMASKED)), uidai, uidai_k))
(OUT / "masked-signed-by-stranger.pdf").write_bytes(sign(encrypted(page(MASKED)), stranger, other_k))
(OUT / "masked-unsigned.pdf").write_bytes(encrypted(page(MASKED)))
print("ok", sorted(p.name for p in OUT.iterdir()))
