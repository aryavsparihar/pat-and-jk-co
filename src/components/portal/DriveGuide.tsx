import React from 'react'

import { APPLICATIONS_CONTACT } from '@/members/contact'

/**
 * How an artist sets out their Google Drive folder, so our team can find each work by its name.
 * Shown on Your works, and the same rules are described for staff in the admin.
 */
export const DriveGuide: React.FC<{ example?: string }> = ({ example = 'River at Dusk' }) => (
  <div className="measure">
    <h2 className="display-sm">How to set out your folder</h2>
    <ol className="mt-4 grid list-decimal gap-y-3 pl-6">
      <li>
        Make one folder in Google Drive for all your works, and share it: <strong>Share</strong>,
        then under General access choose <strong>Anyone with the link</strong>, as a{' '}
        <strong>Viewer</strong>.
      </li>
      <li>
        Inside it, make a folder for each work, named exactly as the work, for example{' '}
        <strong>{example}</strong>.
      </li>
      <li>
        Put the work&rsquo;s photos in its folder, named after the work and numbered:{' '}
        <strong>{example} - 1.jpg</strong>, <strong>{example} - 2.jpg</strong>. The first shows the
        whole work from the front; then any details, the back and the signature.
      </li>
      <li>
        A video, if you have one, goes in the same folder: <strong>{example} - video.mp4</strong>.
      </li>
      <li>
        Describe the work in the same folder, in a Google Doc or a text file named{' '}
        <strong>{example} - description</strong>: the year, the medium and surface, its size in
        centimetres, the edition if there is one, the price in rupees or that it is not for sale,
        and a few lines about the work in your own words.
      </li>
    </ol>
    <p className="mt-4">
      Questions about your works? Write to us at{' '}
      <a className="link" href={`mailto:${APPLICATIONS_CONTACT}`}>
        {APPLICATIONS_CONTACT}
      </a>
      .
    </p>
  </div>
)
