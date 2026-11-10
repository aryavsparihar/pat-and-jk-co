# Automated emails: when each one is sent

Every email the website sends, what sets it off, and who receives it. All of them are sent
through Resend from the website's own address, share the letterhead in
`docs/email/company-template.html`, and end with the registered office and PJK's social links
from Site settings → Contact & social. None of them carries bank details, document numbers or
identity documents.

"Business inbox" is the business address in Site settings, or the general one when it is empty.
"Technical inbox" is the technical address in Site settings.

## To applicants and members

| Email | Sent when | To |
| --- | --- | --- |
| Your PJK verification code | Someone starts an application and asks for a code to confirm their email. | The applicant |
| Your PJK sign-in code | A member asks to sign in. An address with no account is told so on screen, and no email is sent. | The member |
| Confirm a change to your PJK account | A signed-in member does something that needs their identity confirmed again, such as changing payout details. | The member |
| Confirm your new email address | A member asks to change their email address. | The new address |
| The email address on your PJK account has changed | The change of address goes through, whether the member made it or staff made it for them. | The old address, with a way to report it |
| Your PJK account now uses this email address | Staff change the address on a member's request. | The new address |
| We have your application | An artist or partner sends their application. | The applicant |
| Welcome to PAT and J.K. Co. | Staff approve an application. It gives the member ID. | The applicant |
| A few changes to your application | Staff press Ask for changes, with a note. | The applicant |
| Your application to PAT and J.K. Co. | Staff decline an application, with a note. | The applicant |
| Add your payout details | An artist is approved and has no payout details yet. | The artist |
| Payout details added to your account / Your bank details were changed | Payout details are added or changed. It never contains the details, and has a link to stop a change that was not theirs. | The member |
| (Profile) is now public / A few changes to (profile) | Staff approve, or ask for changes to, a member's public profile. | The member |
| Your PJK account has been deleted | A super admin deletes the person, or the member's own deletion request is carried out. It says what, if anything, the law makes us keep. | The address the person had |

## To staff

| Email | Sent when | To |
| --- | --- | --- |
| New artist / partner application (reference) | An application is sent. | Business inbox |
| Application (reference) withdrawn | An applicant withdraws a sent application. | Business inbox |
| Waiting for review: (what) | A member sends a profile or change that needs a review. | Business inbox |
| Works folder from (member ID) | An artist adds or changes their Google Drive works folder. | Business inbox |
| Bank details change waiting, or stopped | A member's change of payout details is waiting, or the member stopped it. | Business inbox |
| Data request: (reference) | A member asks for a copy of their data, deletion, or to withdraw consent. | Business inbox |
| Contact form messages | Someone sends a site form. Who is told is set on each form in the admin (Enquiries → Forms). | The inboxes set on the form |

## To the staff account itself

| Email | Sent when | To |
| --- | --- | --- |
| Admin sign-in code | A member of staff signs in to the admin. | That staff member |
| Admin access requested by (email) | Someone asks for access to the admin. | The super admins |
| Account locked | A staff account is locked after too many wrong passwords. It never says what was tried. | That staff member |
| Password reset | A member of staff asks to reset their password. | That staff member |

## To the technical inbox

| Email | Sent when | To |
| --- | --- | --- |
| PJK security alert: (summary) | Something in the security log needs a person to look, such as repeated failed sign-ins. | Technical inbox |
| PJK site error (on page) | The site hits an unexpected error. At most one per error an hour and ten a day. | Technical inbox |
| PJK email test | Someone runs the email check by hand. | Whoever it is run for |

## Changing them

The wording of these emails is in the website's code (`src/members/emails.ts`,
`src/security/email.ts`), so changing it is a code change. The footer, the inboxes they go to
and the social links come from Site settings, and change as soon as the settings are saved.
