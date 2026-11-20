type FormAssignment = { code: string; state: string; lga: string; ward: string };

export function normalizeCe8aCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value
    .trim()
    .match(/^(\d{1,3})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,3})$/);
  if (!parts) return null;
  const codes = parts.slice(1).map(Number);
  if (codes.some((code) => code < 1) || codes[0] > 99) return null;
  return codes.map((code, index) => String(code).padStart(index === 3 ? 3 : 2, "0")).join("-");
}

function normalizePlace(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/\b(?:state|local government area|lga|registration area|ward)\b/g, "")
        .replace(/[^a-z0-9]/g, "")
    : "";
}

export function validateCe8aAssignment(
  form: Record<string, unknown>,
  selection: unknown,
  assignment: FormAssignment,
) {
  const title = typeof form.election_title === "string" ? form.election_title : "";
  const election = /\bgovernorship\b/i.test(title)
    ? "governorship"
    : /\bpresidential\b/i.test(title)
      ? "presidential"
      : /\bsenat(?:e|orial)\b/i.test(title)
        ? "senate"
        : /\bhouse of representatives\b/i.test(title)
          ? "house"
          : /\bhouse of assembly\b/i.test(title)
            ? "state_house"
            : null;
  if (!election) return "We couldn’t read the election title. Please try a clearer photo.";
  if (selection !== election)
    return "The election on this form doesn’t match your selection. Please check and try again.";
  const code = normalizeCe8aCode(form.polling_unit_code);
  const places = [
    [form.state, assignment.state],
    [form.local_government_area, assignment.lga],
    [form.registration_area, assignment.ward],
  ];
  if (
    (code && code !== normalizeCe8aCode(assignment.code)) ||
    places.some(([printed, expected]) => {
      const name = normalizePlace(printed);
      return name && name !== normalizePlace(expected);
    })
  )
    return "This result doesn’t match your polling unit. Please try again.";
  if (!code) return "We couldn’t read the polling-unit code. Please try a clearer photo.";
  return null;
}
