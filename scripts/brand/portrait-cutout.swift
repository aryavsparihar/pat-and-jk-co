// Cuts the subject out of a photograph and reports where the face sits, using Apple's Vision
// framework (no third-party models, nothing downloaded). Used by make-portraits.mjs so that
// portraits from very different source photos can be framed as a matching set.
//
//   swift scripts/brand/portrait-cutout.swift <input-image> <output.png>
//
// Writes a transparent-background PNG and prints the face rectangle as JSON
// (normalised 0–1, origin top-left).

import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: portrait-cutout.swift <input> <output.png>\n".data(using: .utf8)!)
  exit(2)
}

let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])

guard let image = CIImage(contentsOf: inputURL) else {
  FileHandle.standardError.write("could not read \(inputURL.path)\n".data(using: .utf8)!)
  exit(1)
}

let width = image.extent.width
let height = image.extent.height
let handler = VNImageRequestHandler(ciImage: image, options: [:])
let context = CIContext()

// 1. Subject cut-out
do {
  let request = VNGenerateForegroundInstanceMaskRequest()
  try handler.perform([request])
  if let result = request.results?.first {
    let buffer = try result.generateMaskedImage(
      ofInstances: result.allInstances,
      from: handler,
      croppedToInstancesExtent: false,
    )
    let masked = CIImage(cvPixelBuffer: buffer)
    try context.writePNGRepresentation(
      of: masked,
      to: outputURL,
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    )
  } else {
    FileHandle.standardError.write("no subject found\n".data(using: .utf8)!)
    exit(1)
  }
} catch {
  FileHandle.standardError.write("cut-out failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}

// 2. Face rectangle, so both portraits can be framed the same way
var face: [String: Double] = [:]
do {
  let request = VNDetectFaceRectanglesRequest()
  try handler.perform([request])
  if let box = request.results?.first?.boundingBox {
    // Vision's origin is bottom-left; convert to top-left pixels
    face = [
      "x": Double(box.origin.x * width),
      "y": Double((1 - box.origin.y - box.height) * height),
      "width": Double(box.width * width),
      "height": Double(box.height * height),
    ]
  }
} catch {
  // A missing face is not fatal — the caller falls back to the subject's bounding box
}

var payload: [String: Any] = ["width": Double(width), "height": Double(height)]
if !face.isEmpty { payload["face"] = face }
let json = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
