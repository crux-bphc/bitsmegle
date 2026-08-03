// Reads the database name out of a MongoDB connection string.
//
// Deliberately not using `new URL()`: it throws ERR_INVALID_URL on multi-host
// URIs such as mongodb://h1:27017,h2:27017/db?replicaSet=rs0, which are what
// any replica set or Atlas-style deployment looks like.
//
// server/src/config/mongo.ts carries the same logic for the backend; keep the
// two in sync.
export const DEFAULT_DB_NAME = 'bitsmegle';

export function databaseNameFromUri(uri) {
	const afterScheme = uri.split('://')[1] ?? '';
	const path = afterScheme.split('/')[1] ?? '';
	return path.split('?')[0] || DEFAULT_DB_NAME;
}
