/**
 * Strips characters that could break out of a mail header (CR/LF, which
 * enable header injection) from a client-supplied value. Also trims and
 * caps length so a single field can't be used to smuggle an oversized
 * payload into the message.
 */
export function sanitizeMailHeaderValue(value: FormDataEntryValue | null, maxLength = 200): string {
	return String(value ?? '')
		.replace(/[\r\n]+/g, ' ')
		.trim()
		.slice(0, maxLength);
}
