import db from './mongo';
import type { User } from '$lib/types';

export const users = db.collection<User>('users');
