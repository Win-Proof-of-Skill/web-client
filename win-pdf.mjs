import { PDFDocument, rgb } from './external/pdf-lib.esm.min.mjs';
import fontkit from './external/fontkit.mjs';
import { formatUnits } from './win-domain.mjs';

/** Self-contained, paginated public profile PDF. Private wallet data is never accepted. */
export async function createProfilePdf(
  { profile, score, work = [], endorsements = [], skills = [], networkId, exportedAt = new Date() },
  fontBytes
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(`${profile.displayName} - WIN Proof of Skill`);
  pdf.setAuthor('WIN Proof of Skill');
  pdf.setSubject('Snapshot of public profile and work records');
  const green = rgb(0, 0.424, 0.208),
    ink = rgb(0.1, 0.22, 0.16),
    muted = rgb(0.37, 0.44, 0.39);
  const width = 595.28,
    height = 841.89,
    margin = 48,
    available = width - margin * 2;
  const supported = new Set(font.getCharacterSet());
  // DejaVu covers Latin, Greek, Cyrillic and Arabic. Fail explicitly for missing
  // scripts instead of silently exporting empty squares or replacing someone's name.
  const checked = (value) => {
    const text = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '  ');
    for (const char of text)
      if (char !== '\n' && !supported.has(char.codePointAt(0)))
        throw new Error('This profile contains characters not supported by PDF export yet.');
    return text;
  };
  let page, y;
  const addPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
    page.drawText('WIN  /  PROOF OF SKILL', { x: margin, y, font, size: 9, color: green });
    page.drawLine({
      start: { x: margin, y: y - 14 },
      end: { x: width - margin, y: y - 14 },
      thickness: 1,
      color: green,
    });
    y -= 42;
  };
  const space = (amount) => {
    if (y - amount < 58) addPage();
  };
  const line = (text, size, color) => {
    space(size * 1.5);
    page.drawText(text, { x: margin, y, font, size, color });
    y -= size * 1.5;
  };
  function paragraph(value, size = 10, color = ink) {
    for (const row of checked(value).split('\n')) {
      if (!row) {
        space(size);
        y -= size;
        continue;
      }
      let current = '';
      // Splits even long unbroken addresses and URLs, without cutting surrogate pairs.
      for (const word of row.split(/(\s+)/)) {
        if (font.widthOfTextAtSize(current + word, size) <= available) {
          current += word;
          continue;
        }
        if (current.trim()) {
          line(current.trimEnd(), size, color);
          current = '';
        }
        for (const char of word.trimStart()) {
          if (font.widthOfTextAtSize(current + char, size) > available) {
            line(current, size, color);
            current = '';
          }
          current += char;
        }
      }
      if (current) line(current.trimEnd(), size, color);
    }
    y -= 5;
  }
  function heading(text) {
    space(54);
    y -= 12;
    paragraph(text, 12, green);
  }
  const skill = (id) => skills.find((s) => s.id === id)?.name || id;
  const pretty = (value) =>
    Array.isArray(value)
      ? value.map(pretty).join('\n')
      : value && typeof value === 'object'
      ? Object.entries(value)
          .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${pretty(v)}`)
          .join('\n')
      : String(value ?? '');
  addPage();
  paragraph(profile.displayName, 25, green);
  paragraph(profile.details?.headline || profile.details?.legalName || profile.type, 12, muted);
  paragraph(`Proof score: ${score == null ? 'Unavailable' : formatUnits(score, 6)}`, 15, green);
  heading('About');
  paragraph(profile.summary || 'No summary added.');
  heading('Skills');
  paragraph(
    (profile.details?.skills || [])
      .map((s) => `${skill(s.skillId)}${s.selfAssessedLevel ? ' - ' + s.selfAssessedLevel : ''}`)
      .join(' / ') || 'No skills added.'
  );
  for (const [key, value] of Object.entries(profile.details || {})) {
    if (['headline', 'skills', 'legalName'].includes(key)) continue;
    heading(key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
    paragraph(pretty(value));
  }
  if (profile.contact) {
    heading('Contact');
    paragraph(pretty(profile.contact));
  }
  heading('Work records');
  if (!work.length) paragraph('No work records.');
  for (const contract of work) {
    space(75);
    paragraph(contract.title, 11, green);
    paragraph(contract.publicDescription);
    paragraph(
      `${contract.terms.startDate} - ${contract.terms.endDate || 'Ongoing'} | ${
        contract.effectiveApprovalStatus || contract.approvalStatus
      } | ${contract.approvals.length}/${contract.hiringProfileIds.length} approvals`,
      9,
      muted
    );
    paragraph(`Record: ${contract.id}`, 8, muted);
  }
  heading('Skill endorsements');
  const received = endorsements.filter((e) => e.subjectProfileId === profile.id);
  if (!received.length) paragraph('No endorsements.');
  for (const endorsement of received) {
    space(65);
    paragraph(skill(endorsement.skillId), 11, green);
    paragraph(endorsement.statement);
    paragraph(
      `${endorsement.relationship} | ${
        endorsement.effectiveStatus || endorsement.status
      } | Valid until ${new Date(endorsement.validUntil).toISOString().slice(0, 10)}`,
      9,
      muted
    );
    paragraph(`Endorsing profile: ${endorsement.endorserProfileId}`, 8, muted);
  }
  heading('Public record');
  paragraph(
    `Profile: ${profile.id}\nOwner: ${profile.owner}\nNetwork: ${networkId}\nRevision: ${
      profile.revision
    }\nExported: ${exportedAt.toISOString().slice(0, 10)}`,
    8,
    muted
  );
  paragraph(
    'This PDF is a snapshot of public network records. Scores and statuses may change. Skill endorsements are attestations; aggregate scores follow the native WIN contract-outcome rules.',
    8,
    muted
  );
  pdf
    .getPages()
    .forEach((p, index) =>
      p.drawText(
        `WIN / PROOF OF SKILL                                      ${index + 1} / ${pdf.getPageCount()}`,
        { x: margin, y: 31, font, size: 8, color: muted }
      )
    );
  return pdf.save();
}

export async function downloadProfilePdf(data) {
  const response = await fetch(new URL('./fonts/DejaVuSans.ttf', import.meta.url));
  if (!response.ok) throw new Error('The PDF font could not be loaded. Try again when connected.');
  const bytes = await createProfilePdf(data, await response.arrayBuffer());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${
    data.profile.displayName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'WIN'
  }-profile.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
