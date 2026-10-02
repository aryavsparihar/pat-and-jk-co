/**
 * The blocks the collaborate page gains with the onboarding: the two ways in, and how it works.
 * Used by the seed for a fresh install. On the live site the page already has content of its own,
 * so these are added there only with the owner's say-so (see docs/ADMIN_GUIDE.md).
 */
export const pathsBlock = {
  blockType: 'paths',
  eyebrow: 'Apply',
  heading: 'Two ways to begin',
  artists: {
    heading: 'Artists',
    text: 'Show and sell your work through Phulhaar Gallery by PJK. Tell us about your practice and send a small selection of your work.',
    linkLabel: 'Apply as an artist',
  },
  partners: {
    heading: 'Partners',
    text: 'For curators, interior designers and decorators; designers and engineers; and galleries, institutions and businesses who think in the long term.',
    linkLabel: 'Apply as a partner',
  },
  signInText: 'Already applied? Sign in to see where your application has got to.',
}

export const howItWorksBlock = {
  blockType: 'principles',
  eyebrow: 'How it works',
  heading: 'Three steps, at your pace',
  numbering: 'roman',
  items: [
    {
      title: 'Apply',
      text: 'Tell us about yourself, online, in your own time. Your application is saved as you go, so you can stop and come back to it.',
    },
    {
      title: 'Conversation',
      text: 'We read every application ourselves. If it is a good fit, we will be in touch to talk it through, or to ask a question or two.',
    },
    {
      title: 'Welcome',
      text: 'Once we agree to work together, you receive a member ID and an account of your own, and we begin.',
    },
  ],
}
