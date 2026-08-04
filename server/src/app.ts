import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import statsRouter from './routes/stats';
import usersRouter from './routes/users';

export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// POST / triggers an outbound Google request + Mongo query; POST /rep triggers both too.
const usersWriteLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: true,
	legacyHeaders: false
});

app.use('/stats', statsRouter);
app.use('/api/users', usersWriteLimiter, usersRouter);
