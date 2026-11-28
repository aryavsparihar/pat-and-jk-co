/**
 * The admin panel's own messages, in the founder's wording (error document of 25 November 2026,
 * section 13). The CMS's English lines ("The email or password provided is incorrect.", "This
 * field is required.") are replaced here; Payload merges these over its own, so every line not
 * named here stays as Payload has it. Placeholders in {{double braces}} are filled in by Payload.
 */
export const adminMessages = {
  en: {
    error: {
      correctInvalidFields: 'Some fields need another look. They are marked below.',
      emailOrPasswordIncorrect: 'The email address or password is not right.',
      tokenInvalidOrExpired:
        'This reset link is not valid or has run out. Please ask for a new one.',
      userLocked:
        'This account is locked after too many wrong passwords. Try again later, or ask a super admin to unlock it.',
    },
    fields: {
      passwordsDoNotMatch: 'The two passwords do not match.',
    },
    validation: {
      emailAddress: 'Please enter a full email address.',
      enterNumber: 'Please enter a number.',
      greaterThanMax: '{{label}} must be no more than {{max}}.',
      invalidSelection: 'Please choose one of the options.',
      lessThanMin: '{{label}} must be at least {{min}}.',
      limitReached: 'You have reached the limit of {{max}} items.',
      longerThanMin: 'Please write at least {{minLength}} characters.',
      notValidDate: '“{{value}}” is not a date. Please check it.',
      required: 'Please fill this in.',
      requiresAtLeast: 'Please add at least {{count}} {{label}}.',
      requiresNoMoreThan: 'Please add no more than {{count}} {{label}}.',
      shorterThanMax: 'Please keep this to {{maxLength}} characters or fewer.',
    },
  },
}
