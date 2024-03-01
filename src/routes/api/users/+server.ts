let userCount: number = 0;

export const GET = () => {
	userCount += 1;
	setTimeout(
		() => {
			userCount -= 1;
		},
		1 * 60 * 1000
	); // 1 minutes;
	let resp = new Response(JSON.stringify({ count: userCount }), {
		status: 200
	});
	return resp;
};
