import express from 'express';
import cors from 'cors';
import statsRouter from './routes/stats';
import usersRouter from './routes/users';

export const app = express();
app.use(cors());
app.use(express.json());

app.use('/stats', statsRouter);
app.use('/users', usersRouter);
