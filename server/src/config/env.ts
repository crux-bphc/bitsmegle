import dotenv from 'dotenv';
dotenv.config();

if (
	!process.env.DB_URI ||
	!process.env.SECRET_CLIENT_ID ||
	!process.env.SECRET_CLIENT_SECRET ||
	!process.env.PORT
) {
	throw new Error('Missing one of DB_URI, SECRET_CLIENT_ID, SECRET_CLIENT_SECRET or PORT');
}

export const DB_URI = process.env.DB_URI;
export const SECRET_CLIENT_ID = process.env.SECRET_CLIENT_ID;
export const SECRET_CLIENT_SECRET = process.env.SECRET_CLIENT_SECRET;
export const PORT = process.env.PORT;
