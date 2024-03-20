import nodemailer from 'nodemailer';
import { SECRET_GMAIL_USER, SECRET_GMAIL_PASS } from '$env/static/private';

export const actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

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

		let text =
			'Report from ' +
			formData.get('reporterName') +
			'(' +
			formData.get('reporterEmail') +
			') against ' +
			formData.get('reporteeEmail') +
			'\nContents:\n' +
			formData.get('message');

		const mailOptions = {
			from: 'cwswas.py@gmail.com',
			to: 'bitsmegle@gmail.com',
			subject:
				'Report against ' + formData.get('reporteeEmail') + ' by ' + formData.get('reporterName'),
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
