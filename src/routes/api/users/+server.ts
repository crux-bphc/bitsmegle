let userCount: number = 0;

export const GET = () => {
	userCount += 1;
	setTimeout(() => {
		userCount -= 1;
	}, 4 * 1000); // 5-1 sec;
	let resp = new Response(JSON.stringify({ count: userCount }), {
		status: 200
	});
	return resp;
};
