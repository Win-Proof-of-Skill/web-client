export const CONTRACT_TYPES = Object.freeze({ employee: 'Employee', student: 'Student', internship: 'Internship' });
export function contractType(record) {
  return record.contractType ?? 'employee';
}
export function allowsStudentContract(institutions) {
  return institutions.length > 0 && institutions.every((p) => p && ['university', 'school'].includes(p.type));
}
export function cvSections(profile, contracts) {
  return [
    {
      title: 'Experience',
      details: profile.details?.experience,
      records: contracts.filter((c) => contractType(c) === 'employee'),
    },
    {
      title: 'Education',
      details: profile.details?.education,
      records: contracts.filter((c) => contractType(c) === 'student'),
    },
    {
      title: 'Internships',
      details: profile.details?.internships,
      records: contracts.filter((c) => contractType(c) === 'internship'),
    },
  ];
}
