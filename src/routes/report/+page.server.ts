import nodemailer from 'nodemailer';
import { fail } from '@sveltejs/kit';
import { SECRET_GMAIL_USER, SECRET_GMAIL_PASS } from '$env/static/private';
import { sanitizeMailHeaderValue } from '$lib/server/mailSanitize';
import { isRateLimited } from '$lib/server/rateLimit';

const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const actions = {
	default: async ({ request, getClientAddress }) => {
		if (isRateLimited(getClientAddress(), RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
			return fail(429, { message: 'Too many reports submitted. Please try again later.' });
		}

		const formData = await request.formData();

		// Honeypot: real users never see or fill this field, so a filled one
		// means a bot. Report success without actually sending mail.
		if (formData.get('website')) {
			return { success: true };
		}

		const reporterName = sanitizeMailHeaderValue(formData.get('reporterName'));
		const reporterEmail = sanitizeMailHeaderValue(formData.get('reporterEmail'));
		const reporteeEmail = sanitizeMailHeaderValue(formData.get('reporteeEmail'));
		const message = String(formData.get('message') ?? '');

		const transporter = nodemailer.createTransport({
			host: 'smtp.gmail.com',
			port: 587,
			secure: false,
			auth: {
				user: SECRET_GMAIL_USER,
				pass: SECRET_GMAIL_PASS
			},
			tls: {
				rejectUnauthorized: false
			}
		});

		const text =
			'Report from ' +
			reporterName +
			'(' +
			reporterEmail +
			') against ' +
			reporteeEmail +
			'\nContents:\n' +
			message;

		const mailOptions = {
			from: 'cwswas.py@gmail.com',
			to: 'bitsmegle@gmail.com',
			subject: 'Report against ' + reporteeEmail + ' by ' + reporterName,
			text: text
		};

		transporter.sendMail(mailOptions, function (error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log('Email sent: ' + info.response);
			}
		});

		return { success: true };
	}
};
