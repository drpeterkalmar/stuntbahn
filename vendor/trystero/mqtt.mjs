import mqtt from "./mqtt.esm.js";
import { createRelayManager, createTopicStrategy, getRelays, selfId, toJson } from "./core/index.mjs";
//#region src/index.ts
const defaultRedundancy = 4;
const relayManager = createRelayManager((client) => client.stream?.socket);
const topicStates = relayManager.scoped();
const pendingBatches = /* @__PURE__ */ new WeakMap();
const ensureSubscribed = (client, states, topic) => {
	const state = states[topic];
	if (!state) return Promise.resolve();
	if (state.ready) return state.ready;
	let batch = pendingBatches.get(client);
	if (!batch) {
		const topics = /* @__PURE__ */ new Set();
		batch = {
			topics,
			promise: new Promise((resolve) => {
				queueMicrotask(() => {
					pendingBatches.delete(client);
					const activeTopics = [...topics].filter((t) => (states[t]?.refs ?? 0) > 0);
					resolve(activeTopics.length > 0 ? client.subscribeAsync(activeTopics).then(() => {}, (err) => console.error(err)) : void 0);
				});
			})
		};
		pendingBatches.set(client, batch);
	}
	batch.topics.add(topic);
	return state.ready = batch.promise;
};
const joinRoom = createTopicStrategy({
	init: (config) => getRelays(config, defaultRelayUrls, defaultRedundancy).map((url) => {
		const client = relayManager.register(url, () => mqtt.connect(url, {
			queueQoSZero: false,
			resubscribe: false
		}));
		const states = topicStates.forRelay(client);
		if (client.listenerCount("message") === 0) client.on("message", (topic, buffer) => states[topic]?.handler?.(topic, buffer.toString())).on("connect", () => {
			const topics = Object.keys(states).filter((topic) => (states[topic]?.refs ?? 0) > 0);
			if (topics.length === 0) return;
			client.subscribeAsync(topics).then(() => {
				Object.entries(states).forEach(([topic, state]) => {
					if (state.announcement) client.publish(topic, state.announcement);
				});
			}).catch(console.error);
		}).on("error", console.error);
		return client.connected ? Promise.resolve(client) : new Promise((res) => client.once("connect", () => res(client)));
	}),
	subscribeTopic: (client, topic, onMessage, context) => {
		const states = topicStates.forRelay(client);
		const state = states[topic] ??= { refs: 0 };
		const token = Symbol(topic);
		const topicHandler = (topic, data) => onMessage(topic, data);
		state.handler = topicHandler;
		state.token = token;
		state.refs += 1;
		const cleanup = () => {
			state.refs = Math.max(0, state.refs - 1);
			if (state.handler === topicHandler) delete state.handler;
			if (state.token === token) delete state.token;
			if (state.refs === 0) {
				if (state.ready) client.unsubscribe(topic);
				delete states[topic];
			}
		};
		return context.kind === "root" ? Promise.all([ensureSubscribed(client, states, context.selfTopic), ensureSubscribed(client, states, topic)]).then(() => cleanup) : states[context.rootTopic] ? ensureSubscribed(client, states, topic).then(() => cleanup) : cleanup;
	},
	publishTopic: (client, topic, msg, { kind }) => {
		const payload = typeof msg === "string" ? msg : toJson(msg);
		if (kind === "announce") (topicStates.forRelay(client)[topic] ??= { refs: 0 }).announcement = payload;
		if (client.connected) client.publish(topic, payload);
	},
	unpublishTopic: (client, topic) => {
		delete topicStates.forRelay(client)[topic]?.announcement;
	}
});
const getRelaySockets = relayManager.getSockets;
const defaultRelayUrls = [
	"broker.emqx.io:8084/mqtt",
	"public:public@public.cloud.shiftr.io",
	"broker.hivemq.com:8884/mqtt",
	"test.mosquitto.org:8081/mqtt"
].map((url) => "wss://" + url);
//#endregion
export { defaultRelayUrls, getRelaySockets, joinRoom, selfId };

