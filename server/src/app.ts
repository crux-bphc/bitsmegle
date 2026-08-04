import express from 'express';
import cors from 'cors';
import statsRouter from './routes/stats';
import usersRouter from './routes/users';
import { corsOrigins } from './config/corsOrigins';

export const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.use('/stats', statsRouter);
app.use('/api/users', usersRouter);
