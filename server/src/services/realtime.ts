export interface Call {
	callId: string;
	offer: any;
	offerMaker: any;
	offerMakerUser: any;
	answer: any;
	answerMaker: any;
	answerMakerUser: any;
	offerCandidates: any[];
	answerCandidates: any[];
	paired: boolean;
}

export type InteractionsMap = Record<string, string[]>;

export const state = {
	userCount: 0,
	calls: [] as Call[],
	interactions: {} as InteractionsMap,
	stats: {
		totalUsersConnected: 0,
		maxActiveUserCount: 0,
		totalCallsMade: 0,
		totalCallsPaired: 0,
		serverStartTime: new Date().toISOString()
	}
};
