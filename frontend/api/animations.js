import nodeCrypto, { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
//#region node_modules/uncrypto/dist/crypto.node.mjs
var subtle = nodeCrypto.webcrypto?.subtle || {};
//#endregion
//#region node_modules/@upstash/redis/chunk-4WQYU7T6.mjs
var __defProp = Object.defineProperty;
var __export = (target, all) => {
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
};
__export({}, {
	UpstashError: () => UpstashError,
	UpstashJSONParseError: () => UpstashJSONParseError,
	UrlError: () => UrlError
});
var UpstashError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "UpstashError";
	}
};
var UrlError = class extends Error {
	constructor(url) {
		super(`Upstash Redis client was passed an invalid URL. You should pass a URL starting with https. Received: "${url}". `);
		this.name = "UrlError";
	}
};
var UpstashJSONParseError = class extends UpstashError {
	constructor(body, options) {
		const truncatedBody = body.length > 200 ? body.slice(0, 200) + "..." : body;
		super(`Unable to parse response body: ${truncatedBody}`, options);
		this.name = "UpstashJSONParseError";
	}
};
function parseRecursive(obj) {
	const parsed = Array.isArray(obj) ? obj.map((o) => {
		try {
			return parseRecursive(o);
		} catch {
			return o;
		}
	}) : JSON.parse(obj);
	if (typeof parsed === "number" && parsed.toString() !== obj) return obj;
	return parsed;
}
function parseResponse(result) {
	try {
		return parseRecursive(result);
	} catch {
		return result;
	}
}
function deserializeScanResponse(result) {
	return [result[0], ...parseResponse(result.slice(1))];
}
function deserializeScanWithTypesResponse(result) {
	const [cursor, keys] = result;
	const parsedKeys = [];
	for (let i = 0; i < keys.length; i += 2) parsedKeys.push({
		key: keys[i],
		type: keys[i + 1]
	});
	return [cursor, parsedKeys];
}
function mergeHeaders(...headers) {
	const merged = {};
	for (const header of headers) {
		if (!header) continue;
		for (const [key, value] of Object.entries(header)) if (value !== void 0 && value !== null) merged[key] = value;
	}
	return merged;
}
function kvArrayToObject(v) {
	if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
	if (!Array.isArray(v)) return {};
	const obj = {};
	for (let i = 0; i < v.length; i += 2) if (typeof v[i] === "string") obj[v[i]] = v[i + 1];
	return obj;
}
var MAX_BUFFER_SIZE = 1024 * 1024;
var HttpClient = class {
	baseUrl;
	headers;
	options;
	readYourWrites;
	upstashSyncToken = "";
	hasCredentials;
	retry;
	constructor(config) {
		this.options = {
			backend: config.options?.backend,
			agent: config.agent,
			responseEncoding: config.responseEncoding ?? "base64",
			cache: config.cache,
			signal: config.signal,
			keepAlive: config.keepAlive ?? true
		};
		this.upstashSyncToken = "";
		this.readYourWrites = config.readYourWrites ?? true;
		this.baseUrl = (config.baseUrl || "").replace(/\/$/, "");
		if (this.baseUrl && !/^https?:\/\/[^\s#$./?].\S*$/.test(this.baseUrl)) throw new UrlError(this.baseUrl);
		this.headers = {
			"Content-Type": "application/json",
			...config.headers
		};
		this.hasCredentials = Boolean(this.baseUrl && this.headers.authorization.split(" ")[1]);
		if (this.options.responseEncoding === "base64") this.headers["Upstash-Encoding"] = "base64";
		this.retry = typeof config.retry === "boolean" && !config.retry ? {
			attempts: 1,
			backoff: () => 0
		} : {
			attempts: config.retry?.retries ?? 5,
			backoff: config.retry?.backoff ?? ((retryCount) => Math.exp(retryCount) * 50)
		};
	}
	mergeTelemetry(telemetry) {
		this.headers = merge(this.headers, "Upstash-Telemetry-Runtime", telemetry.runtime);
		this.headers = merge(this.headers, "Upstash-Telemetry-Platform", telemetry.platform);
		this.headers = merge(this.headers, "Upstash-Telemetry-Sdk", telemetry.sdk);
	}
	async request(req) {
		if (this.readYourWrites) this.headers["upstash-sync-token"] = this.upstashSyncToken;
		const requestHeaders = mergeHeaders(this.headers, req.headers ?? {});
		const requestUrl = [this.baseUrl, ...req.path ?? []].join("/");
		const isEventStream = requestHeaders.Accept === "text/event-stream";
		const signal = req.signal ?? this.options.signal;
		const isSignalFunction = typeof signal === "function";
		const requestOptions = {
			cache: this.options.cache,
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify(req.body),
			keepalive: this.options.keepAlive,
			agent: this.options.agent,
			signal: isSignalFunction ? signal() : signal,
			/**
			* Fastly specific
			*/
			backend: this.options.backend
		};
		if (!this.hasCredentials) console.warn("[Upstash Redis] Redis client was initialized without url or token. Failed to execute command.");
		let res = null;
		let error = null;
		for (let i = 0; i <= this.retry.attempts; i++) {
			if (i > 0 && requestHeaders["Upstash-Telemetry-Sdk"]) requestHeaders["Upstash-Telemetry-Retry"] = String(i);
			try {
				res = await fetch(requestUrl, requestOptions);
				break;
			} catch (error_) {
				if (requestOptions.signal?.aborted && isSignalFunction) throw error_;
				else if (requestOptions.signal?.aborted) {
					const myBlob = new Blob([JSON.stringify({ result: requestOptions.signal.reason ?? "Aborted" })]);
					const myOptions = {
						status: 200,
						statusText: requestOptions.signal.reason ?? "Aborted"
					};
					res = new Response(myBlob, myOptions);
					break;
				}
				error = error_;
				if (i < this.retry.attempts) await new Promise((r) => setTimeout(r, this.retry.backoff(i)));
			}
		}
		if (!res) throw error ?? /* @__PURE__ */ new Error("Exhausted all retries");
		if (!res.ok) {
			let body2;
			const rawBody2 = await res.text();
			try {
				body2 = JSON.parse(rawBody2);
			} catch (error2) {
				throw new UpstashJSONParseError(rawBody2, { cause: error2 });
			}
			throw new UpstashError(`${body2.error}, command was: ${JSON.stringify(req.body)}`);
		}
		if (this.readYourWrites) {
			const headers = res.headers;
			this.upstashSyncToken = headers.get("upstash-sync-token") ?? "";
		}
		if (isEventStream && req && req.onMessage && res.body) {
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			(async () => {
				try {
					let buffer = "";
					while (true) {
						const { value, done } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() || "";
						if (buffer.length > MAX_BUFFER_SIZE) throw new Error("Buffer size exceeded (1MB)");
						for (const line of lines) if (line.startsWith("data: ")) {
							const data = line.slice(6);
							req.onMessage?.(data);
						}
					}
				} catch (error2) {
					if (error2 instanceof Error && error2.name === "AbortError") {} else console.error("Stream reading error:", error2);
				} finally {
					try {
						await reader.cancel();
					} catch {}
				}
			})();
			return { result: 1 };
		}
		let body;
		const rawBody = await res.text();
		try {
			body = JSON.parse(rawBody);
		} catch (error2) {
			throw new UpstashJSONParseError(rawBody, { cause: error2 });
		}
		if (this.readYourWrites) {
			const headers = res.headers;
			this.upstashSyncToken = headers.get("upstash-sync-token") ?? "";
		}
		if (this.options.responseEncoding === "base64") {
			if (Array.isArray(body)) return body.map(({ result: result2, error: error2 }) => ({
				result: decode(result2),
				error: error2
			}));
			return {
				result: decode(body.result),
				error: body.error
			};
		}
		return body;
	}
};
function base64decode(b64) {
	let dec = "";
	try {
		const binString = atob(b64);
		const size = binString.length;
		const bytes = new Uint8Array(size);
		for (let i = 0; i < size; i++) bytes[i] = binString.charCodeAt(i);
		dec = new TextDecoder().decode(bytes);
	} catch {
		dec = b64;
	}
	return dec;
}
function decode(raw) {
	let result = void 0;
	switch (typeof raw) {
		case "undefined": return raw;
		case "number":
			result = raw;
			break;
		case "object":
			if (Array.isArray(raw)) result = raw.map((v) => typeof v === "string" ? base64decode(v) : Array.isArray(v) ? v.map((element) => decode(element)) : v);
			else result = null;
			break;
		case "string":
			result = raw === "OK" ? "OK" : base64decode(raw);
			break;
		default: break;
	}
	return result;
}
function merge(obj, key, value) {
	if (!value) return obj;
	if (!obj[key]) {
		obj[key] = value;
		return obj;
	}
	if (!obj[key].split(",").map((v) => v.trim()).includes(value.trim())) obj[key] = [obj[key], value].join(",");
	return obj;
}
var defaultSerializer = (c) => {
	switch (typeof c) {
		case "string":
		case "number":
		case "boolean": return c;
		default: return JSON.stringify(c);
	}
};
var Command = class {
	command;
	serialize;
	deserialize;
	headers;
	path;
	onMessage;
	isStreaming;
	signal;
	/**
	* Create a new command instance.
	*
	* You can define a custom `deserialize` function. By default we try to deserialize as json.
	*/
	constructor(command, opts) {
		this.serialize = defaultSerializer;
		this.deserialize = opts?.automaticDeserialization === void 0 || opts.automaticDeserialization ? opts?.deserialize ?? parseResponse : (x) => x;
		this.command = command.map((c) => this.serialize(c));
		this.headers = opts?.headers;
		this.path = opts?.path;
		this.onMessage = opts?.streamOptions?.onMessage;
		this.isStreaming = opts?.streamOptions?.isStreaming ?? false;
		this.signal = opts?.streamOptions?.signal;
		if (opts?.latencyLogging) {
			const originalExec = this.exec.bind(this);
			this.exec = async (client) => {
				const start = performance.now();
				const result = await originalExec(client);
				const loggerResult = (performance.now() - start).toFixed(2);
				console.log(`Latency for \x1B[38;2;19;185;39m${this.command[0].toString().toUpperCase()}\x1B[0m: \x1B[38;2;0;255;255m${loggerResult} ms\x1B[0m`);
				return result;
			};
		}
	}
	/**
	* Execute the command using a client.
	*/
	async exec(client) {
		const { result, error } = await client.request({
			body: this.command,
			path: this.path,
			upstashSyncToken: client.upstashSyncToken,
			headers: this.headers,
			onMessage: this.onMessage,
			isStreaming: this.isStreaming,
			signal: this.signal
		});
		if (error) throw new UpstashError(error);
		if (result === void 0) throw new TypeError("Request did not return a result");
		return this.deserialize(result);
	}
};
var ExecCommand = class extends Command {
	constructor(cmd, opts) {
		const normalizedCmd = cmd.map((arg) => typeof arg === "string" ? arg : String(arg));
		super(normalizedCmd, opts);
	}
};
var FIELD_TYPES = [
	"TEXT",
	"U64",
	"I64",
	"F64",
	"BOOL",
	"DATE",
	"KEYWORD",
	"FACET"
];
function isFieldType(value) {
	return typeof value === "string" && FIELD_TYPES.includes(value);
}
function isDetailedField(value) {
	return typeof value === "object" && value !== null && "type" in value && isFieldType(value.type);
}
function isNestedSchema(value) {
	return typeof value === "object" && value !== null && !isDetailedField(value);
}
function flattenSchema(schema, pathPrefix = []) {
	const fields = [];
	for (const [key, value] of Object.entries(schema)) {
		const currentPath = [...pathPrefix, key];
		const pathString = currentPath.join(".");
		if (isFieldType(value)) fields.push({
			path: pathString,
			type: value
		});
		else if (isDetailedField(value)) fields.push({
			path: pathString,
			type: value.type,
			fast: "fast" in value ? value.fast : void 0,
			noTokenize: "noTokenize" in value ? value.noTokenize : void 0,
			noStem: "noStem" in value ? value.noStem : void 0,
			from: "from" in value ? value.from : void 0
		});
		else if (isNestedSchema(value)) {
			const nestedFields = flattenSchema(value, currentPath);
			fields.push(...nestedFields);
		}
	}
	return fields;
}
function deserializeQueryResponse(rawResponse) {
	return rawResponse.map((itemRaw) => {
		const raw = itemRaw;
		const key = raw[0];
		const score = Number(raw[1]);
		const rawFields = raw[2];
		if (rawFields === void 0) return {
			key,
			score
		};
		if (!Array.isArray(rawFields) || rawFields.length === 0) return {
			key,
			score,
			data: {}
		};
		let data = {};
		for (const fieldRaw of rawFields) {
			const key2 = fieldRaw[0];
			const value = fieldRaw[1];
			const pathParts = key2.split(".");
			if (pathParts.length === 1) data[key2] = value;
			else {
				let currentObj = data;
				for (let i = 0; i < pathParts.length - 1; i++) {
					const pathPart = pathParts[i];
					if (!(pathPart in currentObj)) currentObj[pathPart] = {};
					currentObj = currentObj[pathPart];
				}
				currentObj[pathParts.at(-1)] = value;
			}
		}
		if ("$" in data) data = data["$"];
		return {
			key,
			score,
			data
		};
	});
}
function deserializeDescribeResponse(rawResponse) {
	const description = {};
	for (let i = 0; i < rawResponse.length; i += 2) switch (rawResponse[i]) {
		case "name":
			description["name"] = rawResponse[i + 1];
			break;
		case "type":
			description["dataType"] = rawResponse[i + 1].toLowerCase();
			break;
		case "prefixes":
			description["prefixes"] = rawResponse[i + 1];
			break;
		case "language":
			description["language"] = rawResponse[i + 1];
			break;
		case "schema": {
			const schema = {};
			for (const fieldDescription of rawResponse[i + 1]) {
				const fieldName = fieldDescription[0];
				const fieldInfo = { type: fieldDescription[1] };
				if (fieldDescription.length > 2) for (let j = 2; j < fieldDescription.length; j++) switch (fieldDescription[j]) {
					case "NOSTEM":
						fieldInfo.noStem = true;
						break;
					case "NOTOKENIZE":
						fieldInfo.noTokenize = true;
						break;
					case "FAST":
						fieldInfo.fast = true;
						break;
					case "FROM":
						fieldInfo.from = fieldDescription[++j];
						break;
				}
				schema[fieldName] = fieldInfo;
			}
			description["schema"] = schema;
			break;
		}
	}
	return description;
}
function parseCountResponse(rawResponse) {
	return typeof rawResponse === "number" ? rawResponse : Number.parseInt(rawResponse, 10);
}
function deserializeAggregateResponse(rawResponse) {
	return parseAggregationArray(rawResponse);
}
function parseAggregationArray(arr) {
	const result = {};
	for (let i = 0; i < arr.length; i += 2) {
		const key = arr[i];
		const value = arr[i + 1];
		if (Array.isArray(value)) if (value.length > 0 && typeof value[0] === "string") result[key] = value[0] === "buckets" ? parseBucketsValue(value) : parseStatsValue(value);
		else result[key] = parseAggregationArray(value);
		else result[key] = value;
	}
	return result;
}
function coerceNumericString(value) {
	if (typeof value === "string" && value !== "" && !Number.isNaN(Number(value))) return Number(value);
	return value;
}
function parseStatsValue(arr) {
	const result = {};
	for (let i = 0; i < arr.length; i += 2) {
		const key = arr[i];
		const value = arr[i + 1];
		if (Array.isArray(value) && value.length > 0) if (typeof value[0] === "string") result[key] = parseStatsValue(value);
		else if (Array.isArray(value[0]) && typeof value[0][0] === "string") result[key] = value.map((item) => parseStatsValue(item));
		else result[key] = value;
		else result[key] = coerceNumericString(value);
	}
	return result;
}
function parseBucketsValue(arr) {
	if (arr[0] === "buckets" && Array.isArray(arr[1])) {
		const result = { buckets: arr[1].map((bucket) => {
			const bucketObj = {};
			for (let i = 0; i < bucket.length; i += 2) {
				const key = bucket[i];
				const value = bucket[i + 1];
				bucketObj[key] = Array.isArray(value) && value.length > 0 && typeof value[0] === "string" ? parseStatsValue(value) : value;
			}
			return bucketObj;
		}) };
		for (let i = 2; i < arr.length; i += 2) result[arr[i]] = arr[i + 1];
		return result;
	}
	return arr;
}
function buildQueryCommand(redisCommand, name, options) {
	const command = [
		redisCommand,
		name,
		JSON.stringify(options?.filter ?? {})
	];
	if (options?.limit !== void 0) command.push("LIMIT", options.limit.toString());
	if (options?.offset !== void 0) command.push("OFFSET", options.offset.toString());
	if (options?.select && Object.keys(options.select).length === 0) command.push("NOCONTENT");
	if (options) {
		if ("orderBy" in options && options.orderBy) {
			command.push("ORDERBY");
			for (const [field, direction] of Object.entries(options.orderBy)) command.push(field, direction);
		} else if ("scoreFunc" in options && options.scoreFunc) command.push("SCOREFUNC", ...buildScoreFunc(options.scoreFunc));
	}
	if (options?.highlight) {
		command.push("HIGHLIGHT", "FIELDS", options.highlight.fields.length.toString(), ...options.highlight.fields);
		if (options.highlight.preTag && options.highlight.postTag) command.push("TAGS", options.highlight.preTag, options.highlight.postTag);
	}
	if (options?.select && Object.keys(options.select).length > 0) command.push("SELECT", Object.keys(options.select).length.toString(), ...Object.keys(options.select));
	return command;
}
function buildScoreFunc(scoreBy) {
	const result = [];
	if (typeof scoreBy === "string") result.push("FIELDVALUE", scoreBy);
	else if ("fields" in scoreBy) {
		if (scoreBy.combineMode) result.push("COMBINEMODE", scoreBy.combineMode.toUpperCase());
		if (scoreBy.scoreMode) result.push("SCOREMODE", scoreBy.scoreMode.toUpperCase());
		for (const field of scoreBy.fields) result.push(...buildScoreFuncField(field));
	} else result.push(...buildScoreFuncField(scoreBy));
	return result;
}
function buildScoreFuncField(field) {
	const result = [];
	if (typeof field === "string") result.push("FIELDVALUE", field);
	else {
		if (field.scoreMode) result.push("SCOREMODE", field.scoreMode.toUpperCase());
		result.push("FIELDVALUE", field.field);
		if (field.modifier) result.push("MODIFIER", field.modifier.toUpperCase());
		if (field.factor !== void 0) result.push("FACTOR", field.factor.toString());
		if (field.missing !== void 0) result.push("MISSING", field.missing.toString());
	}
	return result;
}
function buildCreateIndexCommand(params) {
	const { name, schema, dataType, language, skipInitialScan, existsOk } = params;
	let source;
	if (params.dataType === "stream") source = [
		"ON",
		"STREAM",
		params.stream
	];
	else {
		const prefixArray = Array.isArray(params.prefix) ? params.prefix : [params.prefix];
		source = [
			"ON",
			dataType.toUpperCase(),
			"PREFIX",
			prefixArray.length.toString(),
			...prefixArray
		];
	}
	const payload = [
		name,
		...skipInitialScan ? ["SKIPINITIALSCAN"] : [],
		...existsOk ? ["EXISTSOK"] : [],
		...source,
		...language ? ["LANGUAGE", language] : [],
		"SCHEMA"
	];
	const fields = flattenSchema(schema);
	for (const field of fields) {
		payload.push(field.path, field.type);
		if (field.fast) payload.push("FAST");
		if (field.noTokenize) payload.push("NOTOKENIZE");
		if (field.noStem) payload.push("NOSTEM");
		if (field.from) payload.push("FROM", field.from);
	}
	return ["SEARCH.CREATE", ...payload];
}
function buildAggregateCommand(name, options) {
	return [
		"SEARCH.AGGREGATE",
		name,
		JSON.stringify(options?.filter ?? {}),
		JSON.stringify(options.aggregations)
	];
}
var SearchIndex = class {
	name;
	schema;
	client;
	constructor({ name, schema, client }) {
		this.name = name;
		this.schema = schema;
		this.client = client;
	}
	async waitIndexing() {
		return await new ExecCommand(["SEARCH.WAITINDEXING", this.name]).exec(this.client);
	}
	async describe() {
		const rawResult = await new ExecCommand(["SEARCH.DESCRIBE", this.name]).exec(this.client);
		if (!rawResult) return null;
		return deserializeDescribeResponse(rawResult);
	}
	async query(options) {
		const rawResult = await new ExecCommand(buildQueryCommand("SEARCH.QUERY", this.name, options)).exec(this.client);
		if (!rawResult) return rawResult;
		return deserializeQueryResponse(rawResult);
	}
	async aggregate(options) {
		return deserializeAggregateResponse(await new ExecCommand(buildAggregateCommand(this.name, options)).exec(this.client));
	}
	async count({ filter }) {
		return { count: parseCountResponse(await new ExecCommand(buildQueryCommand("SEARCH.COUNT", this.name, { filter })).exec(this.client)) };
	}
	async drop() {
		return await new ExecCommand(["SEARCH.DROP", this.name]).exec(this.client);
	}
	async addAlias({ alias }) {
		return await new ExecCommand([
			"SEARCH.ALIASADD",
			alias,
			this.name
		]).exec(this.client);
	}
};
async function createIndex(client, params) {
	const { name, schema } = params;
	await new ExecCommand(buildCreateIndexCommand(params)).exec(client);
	return initIndex(client, {
		name,
		schema
	});
}
function initIndex(client, params) {
	const { name, schema } = params;
	return new SearchIndex({
		name,
		schema,
		client
	});
}
async function listAliases(client) {
	const rawResult = await new ExecCommand(["SEARCH.LISTALIASES"]).exec(client);
	if (rawResult === 0 || Array.isArray(rawResult) && rawResult.length === 0) return {};
	if (!Array.isArray(rawResult)) return {};
	const aliases = {};
	for (const pair of rawResult) if (Array.isArray(pair) && pair.length === 2) {
		const [alias, index] = pair;
		aliases[alias] = index;
	}
	return aliases;
}
async function addAlias(client, { indexName, alias }) {
	return await new ExecCommand([
		"SEARCH.ALIASADD",
		alias,
		indexName
	]).exec(client);
}
async function delAlias(client, { alias }) {
	return await new ExecCommand(["SEARCH.ALIASDEL", alias]).exec(client);
}
function float32ToBase64(vector) {
	const bytes = new Uint8Array(vector.length * 4);
	const view = new DataView(bytes.buffer);
	for (const [i, value] of vector.entries()) view.setFloat32(i * 4, value, true);
	let binary = "";
	const chunkSize = 32768;
	for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCodePoint(...bytes.subarray(i, i + chunkSize));
	return btoa(binary);
}
function serializeVector(vector) {
	if (Array.isArray(vector)) return [
		"VALUES",
		vector.length,
		...vector
	];
	if (vector instanceof Float32Array) return ["BASE64-FP32", float32ToBase64(vector)];
	return ["BASE64-FP32", vector.base64];
}
function deserializeVectorValues(result) {
	if (result === null) return null;
	return result.map(Number);
}
function deserializeVectorQueryResponse(result) {
	return result.map(([id, score]) => ({
		id: String(id),
		score: Number(score)
	}));
}
function deserializeVectorInfoResponse(result) {
	if (result === null) return null;
	const fields = Array.isArray(result) ? Object.fromEntries(Array.from({ length: Math.floor(result.length / 2) }, (_, i) => [String(result[i * 2]), result[i * 2 + 1]])) : result;
	return {
		dimension: Number(fields.dimension),
		metric: String(fields.metric).toUpperCase()
	};
}
var VectorAddCommand = class extends Command {
	constructor([index, id, vector], cmdOpts) {
		super([
			"VECTOR.ADD",
			index,
			id,
			...serializeVector(vector)
		], cmdOpts);
	}
};
var VectorCountCommand = class extends Command {
	constructor([index], cmdOpts) {
		super(["VECTOR.COUNT", index], cmdOpts);
	}
};
var VectorCreateCommand = class extends Command {
	constructor([index, opts], cmdOpts) {
		const command = [
			"VECTOR.CREATE",
			index,
			"DIM",
			opts.dimension,
			"METRIC",
			opts.metric
		];
		if (opts.existsOk) command.push("EXISTSOK");
		super(command, cmdOpts);
	}
};
var VectorDelCommand = class extends Command {
	constructor([index, id], cmdOpts) {
		super([
			"VECTOR.DEL",
			index,
			id
		], cmdOpts);
	}
};
var VectorDropCommand = class extends Command {
	constructor([index], cmdOpts) {
		super(["VECTOR.DROP", index], cmdOpts);
	}
};
var VectorGetCommand = class extends Command {
	constructor([index, id], cmdOpts) {
		super([
			"VECTOR.GET",
			index,
			id
		], {
			deserialize: deserializeVectorValues,
			...cmdOpts
		});
	}
};
var VectorInfoCommand = class extends Command {
	constructor([index], cmdOpts) {
		super(["VECTOR.INFO", index], {
			deserialize: deserializeVectorInfoResponse,
			...cmdOpts
		});
	}
};
var VectorQueryCommand = class extends Command {
	constructor([index, opts], cmdOpts) {
		const command = [
			"VECTOR.QUERY",
			index,
			"TOPK",
			opts.topK
		];
		if (opts.profile) command.push("PROFILE", opts.profile);
		command.push(...serializeVector(opts.vector));
		super(command, {
			deserialize: deserializeVectorQueryResponse,
			...cmdOpts
		});
	}
};
var VectorIndex = class {
	name;
	client;
	commandOptions;
	constructor({ name, client, commandOptions }) {
		this.name = name;
		this.client = client;
		this.commandOptions = commandOptions;
	}
	/**
	* Adds a vector to the index, or overwrites the vector stored under `id`.
	*
	* @returns `1` if a new vector was inserted, `0` if an existing one was overwritten.
	*/
	add(id, vector) {
		return new VectorAddCommand([
			this.name,
			id,
			vector
		], this.commandOptions).exec(this.client);
	}
	/**
	* Returns the vector stored under `id`, or `null` if it does not exist.
	*/
	get(id) {
		return new VectorGetCommand([this.name, id], this.commandOptions).exec(this.client);
	}
	/**
	* Returns the `topK` nearest neighbours of the query vector.
	*/
	query(options) {
		return new VectorQueryCommand([this.name, options], this.commandOptions).exec(this.client);
	}
	/**
	* Deletes the vector stored under `id`.
	*
	* @returns `1` if the vector existed and was removed, `0` otherwise.
	*/
	delete(id) {
		return new VectorDelCommand([this.name, id], this.commandOptions).exec(this.client);
	}
	/**
	* Returns the number of vectors in the index.
	*/
	count() {
		return new VectorCountCommand([this.name], this.commandOptions).exec(this.client);
	}
	/**
	* Returns the dimension and metric of the index, or `null` if it does not exist.
	*/
	info() {
		return new VectorInfoCommand([this.name], this.commandOptions).exec(this.client);
	}
	/**
	* Drops the index and all vectors in it.
	*
	* @returns `1` if the index existed and was dropped, `0` otherwise.
	*/
	drop() {
		return new VectorDropCommand([this.name], this.commandOptions).exec(this.client);
	}
};
async function createVectorIndex(client, { name, ...opts }, commandOptions) {
	await new VectorCreateCommand([name, opts], commandOptions).exec(client);
	return new VectorIndex({
		name,
		client,
		commandOptions
	});
}
function initVectorIndex(client, name, commandOptions) {
	return new VectorIndex({
		name,
		client,
		commandOptions
	});
}
function deserialize(result) {
	if (result.length === 0) return null;
	const obj = {};
	for (let i = 0; i < result.length; i += 2) {
		const key = result[i];
		const value = result[i + 1];
		try {
			obj[key] = JSON.parse(value);
		} catch {
			obj[key] = value;
		}
	}
	return obj;
}
var HRandFieldCommand = class extends Command {
	constructor(cmd, opts) {
		const command = ["hrandfield", cmd[0]];
		if (typeof cmd[1] === "number") command.push(cmd[1]);
		if (cmd[2]) command.push("WITHVALUES");
		super(command, {
			deserialize: cmd[2] ? (result) => deserialize(result) : opts?.deserialize,
			...opts
		});
	}
};
var AppendCommand = class extends Command {
	constructor(cmd, opts) {
		super(["append", ...cmd], opts);
	}
};
var ArCountCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARCOUNT", ...cmd], opts);
	}
};
var ArDelCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARDEL", ...cmd], opts);
	}
};
var ArDelRangeCommand = class extends Command {
	constructor([key, ...ranges], opts) {
		super([
			"ARDELRANGE",
			key,
			...ranges.flat()
		], opts);
	}
};
var ArGetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARGET", ...cmd], opts);
	}
};
var ArGetRangeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARGETRANGE", ...cmd], opts);
	}
};
var ArGrepCommand = class extends Command {
	constructor([key, start, end, opts], cmdOpts) {
		const command = [
			"ARGREP",
			key,
			start,
			end
		];
		for (const predicate of opts.predicates) if ("exact" in predicate) command.push("EXACT", predicate.exact);
		else if ("match" in predicate) command.push("MATCH", predicate.match);
		else if ("glob" in predicate) command.push("GLOB", predicate.glob);
		else command.push("RE", predicate.re);
		if (opts.combine) command.push(opts.combine.toUpperCase());
		if (opts.noCase) command.push("NOCASE");
		if (opts.withValues) command.push("WITHVALUES");
		if (opts.limit !== void 0) command.push("LIMIT", opts.limit);
		super(command, {
			deserialize: (result) => parseResponse(result).map((item) => Array.isArray(item) ? [String(item[0]), item[1]] : String(item)),
			...cmdOpts
		});
	}
};
function toCamelCase(field) {
	return field.replaceAll(/-([a-z])/g, (_, char) => char.toUpperCase());
}
function deserializeArInfoResponse(result) {
	const entries = Array.isArray(result) ? Array.from({ length: Math.floor(result.length / 2) }, (_, i) => [result[i * 2], result[i * 2 + 1]]) : Object.entries(result);
	const indexFields = /* @__PURE__ */ new Set(["len", "nextInsertIndex"]);
	const info = {};
	for (const [field, value] of entries) {
		const name = toCamelCase(String(field));
		if (indexFields.has(name)) {
			info[name] = String(value);
			continue;
		}
		const numeric = typeof value === "number" ? value : Number(value);
		info[name] = Number.isNaN(numeric) ? value : numeric;
	}
	return info;
}
var ArInfoCommand = class extends Command {
	constructor([key, opts], cmdOpts) {
		const command = ["ARINFO", key];
		if (opts?.full) command.push("FULL");
		super(command, {
			deserialize: deserializeArInfoResponse,
			...cmdOpts
		});
	}
};
var ArInsertCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARINSERT", ...cmd], {
			deserialize: String,
			...opts
		});
	}
};
var ArLastItemsCommand = class extends Command {
	constructor([key, count, opts], cmdOpts) {
		const command = [
			"ARLASTITEMS",
			key,
			count
		];
		if (opts?.rev) command.push("REV");
		super(command, cmdOpts);
	}
};
var ArLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARLEN", ...cmd], {
			deserialize: String,
			...opts
		});
	}
};
var ArMGetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARMGET", ...cmd], opts);
	}
};
var ArMSetCommand = class extends Command {
	constructor([key, values], opts) {
		const pairs = Array.isArray(values) ? values : Object.entries(values);
		super([
			"ARMSET",
			key,
			...pairs.flatMap(([index, value]) => [index, value])
		], opts);
	}
};
var ArNextCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARNEXT", ...cmd], {
			deserialize: (result) => result === null ? null : String(result),
			...opts
		});
	}
};
var ArOpCommand = class extends Command {
	constructor([key, start, end, operation], opts) {
		const command = [
			"AROP",
			key,
			start,
			end
		];
		if (typeof operation === "string") command.push(operation.toUpperCase());
		else command.push("MATCH", operation.match);
		super(command, {
			deserialize: (result) => result === null ? null : Number(result),
			...opts
		});
	}
};
var ArRingCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARRING", ...cmd], {
			deserialize: String,
			...opts
		});
	}
};
var ArScanCommand = class extends Command {
	constructor([key, start, end, opts], cmdOpts) {
		const command = [
			"ARSCAN",
			key,
			start,
			end
		];
		if (opts?.limit !== void 0) command.push("LIMIT", opts.limit);
		super(command, {
			deserialize: (result) => parseResponse(result).map(([index, value]) => [String(index), value]),
			...cmdOpts
		});
	}
};
var ArSeekCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARSEEK", ...cmd], opts);
	}
};
var ArSetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ARSET", ...cmd], opts);
	}
};
var BitCountCommand = class extends Command {
	constructor([key, start, end], opts) {
		const command = ["bitcount", key];
		if (typeof start === "number") command.push(start);
		if (typeof end === "number") command.push(end);
		super(command, opts);
	}
};
var BitFieldCommand = class {
	constructor(args, client, opts, execOperation = (command) => command.exec(this.client)) {
		this.client = client;
		this.opts = opts;
		this.execOperation = execOperation;
		this.command = ["bitfield", ...args];
	}
	command;
	chain(...args) {
		this.command.push(...args);
		return this;
	}
	get(...args) {
		return this.chain("get", ...args);
	}
	set(...args) {
		return this.chain("set", ...args);
	}
	incrby(...args) {
		return this.chain("incrby", ...args);
	}
	overflow(overflow) {
		return this.chain("overflow", overflow);
	}
	exec() {
		const command = new Command(this.command, this.opts);
		return this.execOperation(command);
	}
};
var BitOpCommand = class extends Command {
	constructor(cmd, opts) {
		super(["bitop", ...cmd], opts);
	}
};
var BitPosCommand = class extends Command {
	constructor(cmd, opts) {
		super(["bitpos", ...cmd], opts);
	}
};
var ClientSetInfoCommand = class extends Command {
	constructor([attribute, value], opts) {
		super([
			"CLIENT",
			"SETINFO",
			attribute.toUpperCase(),
			value
		], opts);
	}
};
var CopyCommand = class extends Command {
	constructor([key, destinationKey, opts], commandOptions) {
		super([
			"COPY",
			key,
			destinationKey,
			...opts?.replace ? ["REPLACE"] : []
		], {
			...commandOptions,
			deserialize(result) {
				if (result > 0) return "COPIED";
				return "NOT_COPIED";
			}
		});
	}
};
var DBSizeCommand = class extends Command {
	constructor(opts) {
		super(["dbsize"], opts);
	}
};
var DecrCommand = class extends Command {
	constructor(cmd, opts) {
		super(["decr", ...cmd], opts);
	}
};
var DecrByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["decrby", ...cmd], opts);
	}
};
var DelCommand = class extends Command {
	constructor(cmd, opts) {
		super(["del", ...cmd], opts);
	}
};
var EchoCommand = class extends Command {
	constructor(cmd, opts) {
		super(["echo", ...cmd], opts);
	}
};
var EvalROCommand = class extends Command {
	constructor([script, keys, args], opts) {
		super([
			"eval_ro",
			script,
			keys.length,
			...keys,
			...args ?? []
		], opts);
	}
};
var EvalCommand = class extends Command {
	constructor([script, keys, args], opts) {
		super([
			"eval",
			script,
			keys.length,
			...keys,
			...args ?? []
		], opts);
	}
};
var EvalshaROCommand = class extends Command {
	constructor([sha, keys, args], opts) {
		super([
			"evalsha_ro",
			sha,
			keys.length,
			...keys,
			...args ?? []
		], opts);
	}
};
var EvalshaCommand = class extends Command {
	constructor([sha, keys, args], opts) {
		super([
			"evalsha",
			sha,
			keys.length,
			...keys,
			...args ?? []
		], opts);
	}
};
var ExistsCommand = class extends Command {
	constructor(cmd, opts) {
		super(["exists", ...cmd], opts);
	}
};
var ExpireCommand = class extends Command {
	constructor(cmd, opts) {
		super(["expire", ...cmd.filter(Boolean)], opts);
	}
};
var ExpireAtCommand = class extends Command {
	constructor(cmd, opts) {
		super(["expireat", ...cmd], opts);
	}
};
var FCallCommand = class extends Command {
	constructor([functionName, keys, args], opts) {
		super([
			"fcall",
			functionName,
			...keys ? [keys.length, ...keys] : [0],
			...args ?? []
		], opts);
	}
};
var FCallRoCommand = class extends Command {
	constructor([functionName, keys, args], opts) {
		super([
			"fcall_ro",
			functionName,
			...keys ? [keys.length, ...keys] : [0],
			...args ?? []
		], opts);
	}
};
var FlushAllCommand = class extends Command {
	constructor(args, opts) {
		const command = ["flushall"];
		if (args && args.length > 0 && args[0].async) command.push("async");
		super(command, opts);
	}
};
var FlushDBCommand = class extends Command {
	constructor([opts], cmdOpts) {
		const command = ["flushdb"];
		if (opts?.async) command.push("async");
		super(command, cmdOpts);
	}
};
var FunctionDeleteCommand = class extends Command {
	constructor([libraryName], opts) {
		super([
			"function",
			"delete",
			libraryName
		], opts);
	}
};
var FunctionFlushCommand = class extends Command {
	constructor(opts) {
		super(["function", "flush"], opts);
	}
};
var FunctionListCommand = class extends Command {
	constructor([args], opts) {
		const command = ["function", "list"];
		if (args?.libraryName) command.push("libraryname", args.libraryName);
		if (args?.withCode) command.push("withcode");
		super(command, {
			deserialize: deserialize2,
			...opts
		});
	}
};
function deserialize2(result) {
	if (!Array.isArray(result)) return [];
	return result.map((libRaw) => {
		const lib = kvArrayToObject(libRaw);
		const functionsParsed = lib.functions.map((fnRaw) => kvArrayToObject(fnRaw));
		return {
			libraryName: lib.library_name,
			engine: lib.engine,
			functions: functionsParsed.map((fn) => ({
				name: fn.name,
				description: fn.description ?? void 0,
				flags: fn.flags
			})),
			libraryCode: lib.library_code
		};
	});
}
var FunctionLoadCommand = class extends Command {
	constructor([args], opts) {
		super([
			"function",
			"load",
			...args.replace ? ["replace"] : [],
			args.code
		], opts);
	}
};
var FunctionStatsCommand = class extends Command {
	constructor(opts) {
		super(["function", "stats"], {
			deserialize: deserialize3,
			...opts
		});
	}
};
function deserialize3(result) {
	const rawEngines = kvArrayToObject(kvArrayToObject(result).engines);
	const parsedEngines = Object.fromEntries(Object.entries(rawEngines).map(([key, value]) => [key, kvArrayToObject(value)]));
	return { engines: Object.fromEntries(Object.entries(parsedEngines).map(([key, value]) => [key, {
		librariesCount: value.libraries_count,
		functionsCount: value.functions_count
	}])) };
}
var GeoAddCommand = class extends Command {
	constructor([key, arg1, ...arg2], opts) {
		const command = ["geoadd", key];
		if ("nx" in arg1 && arg1.nx) command.push("nx");
		else if ("xx" in arg1 && arg1.xx) command.push("xx");
		if ("ch" in arg1 && arg1.ch) command.push("ch");
		if ("latitude" in arg1 && arg1.latitude) command.push(arg1.longitude, arg1.latitude, arg1.member);
		command.push(...arg2.flatMap(({ latitude, longitude, member }) => [
			longitude,
			latitude,
			member
		]));
		super(command, opts);
	}
};
var GeoDistCommand = class extends Command {
	constructor([key, member1, member2, unit = "M"], opts) {
		super([
			"GEODIST",
			key,
			member1,
			member2,
			unit
		], opts);
	}
};
var GeoHashCommand = class extends Command {
	constructor(cmd, opts) {
		const [key] = cmd;
		const members = Array.isArray(cmd[1]) ? cmd[1] : cmd.slice(1);
		super([
			"GEOHASH",
			key,
			...members
		], opts);
	}
};
var GeoPosCommand = class extends Command {
	constructor(cmd, opts) {
		const [key] = cmd;
		const members = Array.isArray(cmd[1]) ? cmd[1] : cmd.slice(1);
		super([
			"GEOPOS",
			key,
			...members
		], {
			deserialize: (result) => transform(result),
			...opts
		});
	}
};
function transform(result) {
	const final = [];
	for (const pos of result) {
		if (!pos?.[0] || !pos?.[1]) continue;
		final.push({
			lng: Number.parseFloat(pos[0]),
			lat: Number.parseFloat(pos[1])
		});
	}
	return final;
}
var GeoSearchCommand = class extends Command {
	constructor([key, centerPoint, shape, order, opts], commandOptions) {
		const command = ["GEOSEARCH", key];
		if (centerPoint.type === "FROMMEMBER" || centerPoint.type === "frommember") command.push(centerPoint.type, centerPoint.member);
		if (centerPoint.type === "FROMLONLAT" || centerPoint.type === "fromlonlat") command.push(centerPoint.type, centerPoint.coordinate.lon, centerPoint.coordinate.lat);
		if (shape.type === "BYRADIUS" || shape.type === "byradius") command.push(shape.type, shape.radius, shape.radiusType);
		if (shape.type === "BYBOX" || shape.type === "bybox") command.push(shape.type, shape.rect.width, shape.rect.height, shape.rectType);
		command.push(order);
		if (opts?.count) command.push("COUNT", opts.count.limit, ...opts.count.any ? ["ANY"] : []);
		const transform2 = (result) => {
			if (!opts?.withCoord && !opts?.withDist && !opts?.withHash) return result.map((member) => {
				try {
					return { member: JSON.parse(member) };
				} catch {
					return { member };
				}
			});
			return result.map((members) => {
				let counter = 1;
				const obj = {};
				try {
					obj.member = JSON.parse(members[0]);
				} catch {
					obj.member = members[0];
				}
				if (opts.withDist) obj.dist = Number.parseFloat(members[counter++]);
				if (opts.withHash) obj.hash = members[counter++].toString();
				if (opts.withCoord) obj.coord = {
					long: Number.parseFloat(members[counter][0]),
					lat: Number.parseFloat(members[counter][1])
				};
				return obj;
			});
		};
		super([
			...command,
			...opts?.withCoord ? ["WITHCOORD"] : [],
			...opts?.withDist ? ["WITHDIST"] : [],
			...opts?.withHash ? ["WITHHASH"] : []
		], {
			deserialize: transform2,
			...commandOptions
		});
	}
};
var GeoSearchStoreCommand = class extends Command {
	constructor([destination, key, centerPoint, shape, order, opts], commandOptions) {
		const command = [
			"GEOSEARCHSTORE",
			destination,
			key
		];
		if (centerPoint.type === "FROMMEMBER" || centerPoint.type === "frommember") command.push(centerPoint.type, centerPoint.member);
		if (centerPoint.type === "FROMLONLAT" || centerPoint.type === "fromlonlat") command.push(centerPoint.type, centerPoint.coordinate.lon, centerPoint.coordinate.lat);
		if (shape.type === "BYRADIUS" || shape.type === "byradius") command.push(shape.type, shape.radius, shape.radiusType);
		if (shape.type === "BYBOX" || shape.type === "bybox") command.push(shape.type, shape.rect.width, shape.rect.height, shape.rectType);
		command.push(order);
		if (opts?.count) command.push("COUNT", opts.count.limit, ...opts.count.any ? ["ANY"] : []);
		super([...command, ...opts?.storeDist ? ["STOREDIST"] : []], commandOptions);
	}
};
var GetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["get", ...cmd], opts);
	}
};
var GetBitCommand = class extends Command {
	constructor(cmd, opts) {
		super(["getbit", ...cmd], opts);
	}
};
var GetDelCommand = class extends Command {
	constructor(cmd, opts) {
		super(["getdel", ...cmd], opts);
	}
};
var GetExCommand = class extends Command {
	constructor([key, opts], cmdOpts) {
		const command = ["getex", key];
		if (opts) {
			if ("ex" in opts && typeof opts.ex === "number") command.push("ex", opts.ex);
			else if ("px" in opts && typeof opts.px === "number") command.push("px", opts.px);
			else if ("exat" in opts && typeof opts.exat === "number") command.push("exat", opts.exat);
			else if ("pxat" in opts && typeof opts.pxat === "number") command.push("pxat", opts.pxat);
			else if ("persist" in opts && opts.persist) command.push("persist");
		}
		super(command, cmdOpts);
	}
};
var GetRangeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["getrange", ...cmd], opts);
	}
};
var GetSetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["getset", ...cmd], opts);
	}
};
var HDelCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hdel", ...cmd], opts);
	}
};
var HExistsCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hexists", ...cmd], opts);
	}
};
var HExpireCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields, seconds, option] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hexpire",
			key,
			seconds,
			...option ? [option] : [],
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HExpireAtCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields, timestamp, option] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hexpireat",
			key,
			timestamp,
			...option ? [option] : [],
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HExpireTimeCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hexpiretime",
			key,
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HPersistCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hpersist",
			key,
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HPExpireCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields, milliseconds, option] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hpexpire",
			key,
			milliseconds,
			...option ? [option] : [],
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HPExpireAtCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields, timestamp, option] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hpexpireat",
			key,
			timestamp,
			...option ? [option] : [],
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HPExpireTimeCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hpexpiretime",
			key,
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HPTtlCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"hpttl",
			key,
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HGetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hget", ...cmd], opts);
	}
};
function deserialize4(result) {
	if (result.length === 0) return null;
	const obj = {};
	for (let i = 0; i < result.length; i += 2) {
		const key = result[i];
		const value = result[i + 1];
		try {
			obj[key] = !Number.isNaN(Number(value)) && !Number.isSafeInteger(Number(value)) ? value : JSON.parse(value);
		} catch {
			obj[key] = value;
		}
	}
	return obj;
}
var HGetAllCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hgetall", ...cmd], {
			deserialize: (result) => deserialize4(result),
			...opts
		});
	}
};
function deserialize5(fields, result) {
	if (result.every((field) => field === null)) return null;
	const obj = {};
	for (const [i, field] of fields.entries()) try {
		obj[field] = JSON.parse(result[i]);
	} catch {
		obj[field] = result[i];
	}
	return obj;
}
var HMGetCommand = class extends Command {
	constructor([key, ...fields], opts) {
		super([
			"hmget",
			key,
			...fields
		], {
			deserialize: (result) => deserialize5(fields, result),
			...opts
		});
	}
};
var HGetDelCommand = class extends Command {
	constructor([key, ...fields], opts) {
		super([
			"hgetdel",
			key,
			"FIELDS",
			fields.length,
			...fields
		], {
			deserialize: (result) => deserialize5(fields.map(String), result),
			...opts
		});
	}
};
var HGetExCommand = class extends Command {
	constructor([key, opts, ...fields], cmdOpts) {
		const command = ["hgetex", key];
		if ("ex" in opts && typeof opts.ex === "number") command.push("EX", opts.ex);
		else if ("px" in opts && typeof opts.px === "number") command.push("PX", opts.px);
		else if ("exat" in opts && typeof opts.exat === "number") command.push("EXAT", opts.exat);
		else if ("pxat" in opts && typeof opts.pxat === "number") command.push("PXAT", opts.pxat);
		else if ("persist" in opts && opts.persist) command.push("PERSIST");
		command.push("FIELDS", fields.length, ...fields);
		super(command, {
			deserialize: (result) => deserialize5(fields.map(String), result),
			...cmdOpts
		});
	}
};
var HIncrByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hincrby", ...cmd], opts);
	}
};
var HIncrByFloatCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hincrbyfloat", ...cmd], opts);
	}
};
var HKeysCommand = class extends Command {
	constructor([key], opts) {
		super(["hkeys", key], opts);
	}
};
var HLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hlen", ...cmd], opts);
	}
};
var HMSetCommand = class extends Command {
	constructor([key, kv], opts) {
		super([
			"hmset",
			key,
			...Object.entries(kv).flatMap(([field, value]) => [field, value])
		], opts);
	}
};
var HScanCommand = class extends Command {
	constructor([key, cursor, cmdOpts], opts) {
		const command = [
			"hscan",
			key,
			cursor
		];
		if (cmdOpts?.match) command.push("match", cmdOpts.match);
		if (typeof cmdOpts?.count === "number") command.push("count", cmdOpts.count);
		super(command, {
			deserialize: deserializeScanResponse,
			...opts
		});
	}
};
var HSetCommand = class extends Command {
	constructor([key, kv], opts) {
		super([
			"hset",
			key,
			...Object.entries(kv).flatMap(([field, value]) => [field, value])
		], opts);
	}
};
var HSetExCommand = class extends Command {
	constructor([key, opts, kv], cmdOpts) {
		const command = ["hsetex", key];
		if (opts.conditional) command.push(opts.conditional.toUpperCase());
		if (opts.expiration) {
			if ("ex" in opts.expiration && typeof opts.expiration.ex === "number") command.push("EX", opts.expiration.ex);
			else if ("px" in opts.expiration && typeof opts.expiration.px === "number") command.push("PX", opts.expiration.px);
			else if ("exat" in opts.expiration && typeof opts.expiration.exat === "number") command.push("EXAT", opts.expiration.exat);
			else if ("pxat" in opts.expiration && typeof opts.expiration.pxat === "number") command.push("PXAT", opts.expiration.pxat);
			else if ("keepttl" in opts.expiration && opts.expiration.keepttl) command.push("KEEPTTL");
		}
		const entries = Object.entries(kv);
		command.push("FIELDS", entries.length);
		for (const [field, value] of entries) command.push(field, value);
		super(command, cmdOpts);
	}
};
var HSetNXCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hsetnx", ...cmd], opts);
	}
};
var HStrLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hstrlen", ...cmd], opts);
	}
};
var HTtlCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, fields] = cmd;
		const fieldArray = Array.isArray(fields) ? fields : [fields];
		super([
			"httl",
			key,
			"FIELDS",
			fieldArray.length,
			...fieldArray
		], opts);
	}
};
var HValsCommand = class extends Command {
	constructor(cmd, opts) {
		super(["hvals", ...cmd], opts);
	}
};
var IncrCommand = class extends Command {
	constructor(cmd, opts) {
		super(["incr", ...cmd], opts);
	}
};
var IncrByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["incrby", ...cmd], opts);
	}
};
var IncrByFloatCommand = class extends Command {
	constructor(cmd, opts) {
		super(["incrbyfloat", ...cmd], opts);
	}
};
var JsonArrAppendCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.ARRAPPEND", ...cmd], opts);
	}
};
var JsonArrIndexCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.ARRINDEX", ...cmd], opts);
	}
};
var JsonArrInsertCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.ARRINSERT", ...cmd], opts);
	}
};
var JsonArrLenCommand = class extends Command {
	constructor(cmd, opts) {
		super([
			"JSON.ARRLEN",
			cmd[0],
			cmd[1] ?? "$"
		], opts);
	}
};
var JsonArrPopCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.ARRPOP", ...cmd], opts);
	}
};
var JsonArrTrimCommand = class extends Command {
	constructor(cmd, opts) {
		const path = cmd[1] ?? "$";
		const start = cmd[2] ?? 0;
		const stop = cmd[3] ?? 0;
		super([
			"JSON.ARRTRIM",
			cmd[0],
			path,
			start,
			stop
		], opts);
	}
};
var JsonClearCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.CLEAR", ...cmd], opts);
	}
};
var JsonDelCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.DEL", ...cmd], opts);
	}
};
var JsonForgetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.FORGET", ...cmd], opts);
	}
};
var JsonGetCommand = class extends Command {
	constructor(cmd, opts) {
		const command = ["JSON.GET"];
		if (typeof cmd[1] === "string") command.push(...cmd);
		else {
			command.push(cmd[0]);
			if (cmd[1]) {
				if (cmd[1].indent) command.push("INDENT", cmd[1].indent);
				if (cmd[1].newline) command.push("NEWLINE", cmd[1].newline);
				if (cmd[1].space) command.push("SPACE", cmd[1].space);
			}
			command.push(...cmd.slice(2));
		}
		super(command, opts);
	}
};
var JsonMergeCommand = class extends Command {
	constructor(cmd, opts) {
		const command = ["JSON.MERGE", ...cmd];
		super(command, opts);
	}
};
var JsonMGetCommand = class extends Command {
	constructor(cmd, opts) {
		super([
			"JSON.MGET",
			...cmd[0],
			cmd[1]
		], opts);
	}
};
var JsonMSetCommand = class extends Command {
	constructor(cmd, opts) {
		const command = ["JSON.MSET"];
		for (const c of cmd) command.push(c.key, c.path, c.value);
		super(command, opts);
	}
};
var JsonNumIncrByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.NUMINCRBY", ...cmd], opts);
	}
};
var JsonNumMultByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.NUMMULTBY", ...cmd], opts);
	}
};
var JsonObjKeysCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.OBJKEYS", ...cmd], opts);
	}
};
var JsonObjLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.OBJLEN", ...cmd], opts);
	}
};
var JsonRespCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.RESP", ...cmd], opts);
	}
};
var JsonSetCommand = class extends Command {
	constructor(cmd, opts) {
		const command = [
			"JSON.SET",
			cmd[0],
			cmd[1],
			cmd[2]
		];
		if (cmd[3]) {
			if (cmd[3].nx) command.push("NX");
			else if (cmd[3].xx) command.push("XX");
		}
		super(command, opts);
	}
};
var JsonStrAppendCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.STRAPPEND", ...cmd], opts);
	}
};
var JsonStrLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.STRLEN", ...cmd], opts);
	}
};
var JsonToggleCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.TOGGLE", ...cmd], opts);
	}
};
var JsonTypeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["JSON.TYPE", ...cmd], opts);
	}
};
var KeysCommand = class extends Command {
	constructor(cmd, opts) {
		super(["keys", ...cmd], opts);
	}
};
var LIndexCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lindex", ...cmd], opts);
	}
};
var LInsertCommand = class extends Command {
	constructor(cmd, opts) {
		super(["linsert", ...cmd], opts);
	}
};
var LLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["llen", ...cmd], opts);
	}
};
var LMoveCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lmove", ...cmd], opts);
	}
};
var LmPopCommand = class extends Command {
	constructor(cmd, opts) {
		const [numkeys, keys, direction, count] = cmd;
		super([
			"LMPOP",
			numkeys,
			...keys,
			direction,
			...count ? ["COUNT", count] : []
		], opts);
	}
};
var LPopCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lpop", ...cmd], opts);
	}
};
var LPosCommand = class extends Command {
	constructor(cmd, opts) {
		const args = [
			"lpos",
			cmd[0],
			cmd[1]
		];
		if (typeof cmd[2]?.rank === "number") args.push("rank", cmd[2].rank);
		if (typeof cmd[2]?.count === "number") args.push("count", cmd[2].count);
		if (typeof cmd[2]?.maxLen === "number") args.push("maxLen", cmd[2].maxLen);
		super(args, opts);
	}
};
var LPushCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lpush", ...cmd], opts);
	}
};
var LPushXCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lpushx", ...cmd], opts);
	}
};
var LRangeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lrange", ...cmd], opts);
	}
};
var LRemCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lrem", ...cmd], opts);
	}
};
var LSetCommand = class extends Command {
	constructor(cmd, opts) {
		super(["lset", ...cmd], opts);
	}
};
var LTrimCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ltrim", ...cmd], opts);
	}
};
var MGetCommand = class extends Command {
	constructor(cmd, opts) {
		const keys = Array.isArray(cmd[0]) ? cmd[0] : cmd;
		super(["mget", ...keys], opts);
	}
};
var MSetCommand = class extends Command {
	constructor([kv], opts) {
		super(["mset", ...Object.entries(kv).flatMap(([key, value]) => [key, value])], opts);
	}
};
var MSetNXCommand = class extends Command {
	constructor([kv], opts) {
		super(["msetnx", ...Object.entries(kv).flat()], opts);
	}
};
var PersistCommand = class extends Command {
	constructor(cmd, opts) {
		super(["persist", ...cmd], opts);
	}
};
var PExpireCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pexpire", ...cmd], opts);
	}
};
var PExpireAtCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pexpireat", ...cmd], opts);
	}
};
var PfAddCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pfadd", ...cmd], opts);
	}
};
var PfCountCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pfcount", ...cmd], opts);
	}
};
var PfMergeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pfmerge", ...cmd], opts);
	}
};
var PingCommand = class extends Command {
	constructor(cmd, opts) {
		const command = ["ping"];
		if (cmd?.[0] !== void 0) command.push(cmd[0]);
		super(command, opts);
	}
};
var PSetEXCommand = class extends Command {
	constructor(cmd, opts) {
		super(["psetex", ...cmd], opts);
	}
};
var PTtlCommand = class extends Command {
	constructor(cmd, opts) {
		super(["pttl", ...cmd], opts);
	}
};
var PublishCommand = class extends Command {
	constructor(cmd, opts) {
		super(["publish", ...cmd], opts);
	}
};
var RandomKeyCommand = class extends Command {
	constructor(opts) {
		super(["randomkey"], opts);
	}
};
var RenameCommand = class extends Command {
	constructor(cmd, opts) {
		super(["rename", ...cmd], opts);
	}
};
var RenameNXCommand = class extends Command {
	constructor(cmd, opts) {
		super(["renamenx", ...cmd], opts);
	}
};
var RPopCommand = class extends Command {
	constructor(cmd, opts) {
		super(["rpop", ...cmd], opts);
	}
};
var RPushCommand = class extends Command {
	constructor(cmd, opts) {
		super(["rpush", ...cmd], opts);
	}
};
var RPushXCommand = class extends Command {
	constructor(cmd, opts) {
		super(["rpushx", ...cmd], opts);
	}
};
var SAddCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sadd", ...cmd], opts);
	}
};
var ScanCommand = class extends Command {
	constructor([cursor, opts], cmdOpts) {
		const command = ["scan", cursor];
		if (opts?.match) command.push("match", opts.match);
		if (typeof opts?.count === "number") command.push("count", opts.count);
		if (opts && "withType" in opts && opts.withType === true) command.push("withtype");
		else if (opts && "type" in opts && opts.type && opts.type.length > 0) command.push("type", opts.type);
		super(command, {
			deserialize: opts?.withType ? deserializeScanWithTypesResponse : deserializeScanResponse,
			...cmdOpts
		});
	}
};
var SCardCommand = class extends Command {
	constructor(cmd, opts) {
		super(["scard", ...cmd], opts);
	}
};
var ScriptExistsCommand = class extends Command {
	constructor(hashes, opts) {
		super([
			"script",
			"exists",
			...hashes
		], {
			deserialize: (result) => result,
			...opts
		});
	}
};
var ScriptFlushCommand = class extends Command {
	constructor([opts], cmdOpts) {
		const cmd = ["script", "flush"];
		if (opts?.sync) cmd.push("sync");
		else if (opts?.async) cmd.push("async");
		super(cmd, cmdOpts);
	}
};
var ScriptLoadCommand = class extends Command {
	constructor(args, opts) {
		super([
			"script",
			"load",
			...args
		], opts);
	}
};
var SDiffCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sdiff", ...cmd], opts);
	}
};
var SDiffStoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sdiffstore", ...cmd], opts);
	}
};
var SetCommand = class extends Command {
	constructor([key, value, opts], cmdOpts) {
		const command = [
			"set",
			key,
			value
		];
		if (opts) {
			if ("nx" in opts && opts.nx) command.push("nx");
			else if ("xx" in opts && opts.xx) command.push("xx");
			if ("get" in opts && opts.get) command.push("get");
			if ("ex" in opts && typeof opts.ex === "number") command.push("ex", opts.ex);
			else if ("px" in opts && typeof opts.px === "number") command.push("px", opts.px);
			else if ("exat" in opts && typeof opts.exat === "number") command.push("exat", opts.exat);
			else if ("pxat" in opts && typeof opts.pxat === "number") command.push("pxat", opts.pxat);
			else if ("keepTtl" in opts && opts.keepTtl) command.push("keepTtl");
		}
		super(command, cmdOpts);
	}
};
var SetBitCommand = class extends Command {
	constructor(cmd, opts) {
		super(["setbit", ...cmd], opts);
	}
};
var SetExCommand = class extends Command {
	constructor(cmd, opts) {
		super(["setex", ...cmd], opts);
	}
};
var SetNxCommand = class extends Command {
	constructor(cmd, opts) {
		super(["setnx", ...cmd], opts);
	}
};
var SetRangeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["setrange", ...cmd], opts);
	}
};
var SInterCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sinter", ...cmd], opts);
	}
};
var SInterCardCommand = class extends Command {
	constructor(cmd, cmdOpts) {
		const [keys, opts] = cmd;
		const command = [
			"sintercard",
			keys.length,
			...keys
		];
		if (opts?.limit !== void 0) command.push("LIMIT", opts.limit);
		super(command, cmdOpts);
	}
};
var SInterStoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sinterstore", ...cmd], opts);
	}
};
var SIsMemberCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sismember", ...cmd], opts);
	}
};
var SMembersCommand = class extends Command {
	constructor(cmd, opts) {
		super(["smembers", ...cmd], opts);
	}
};
var SMIsMemberCommand = class extends Command {
	constructor(cmd, opts) {
		super([
			"smismember",
			cmd[0],
			...cmd[1]
		], opts);
	}
};
var SMoveCommand = class extends Command {
	constructor(cmd, opts) {
		super(["smove", ...cmd], opts);
	}
};
var SPopCommand = class extends Command {
	constructor([key, count], opts) {
		const command = ["spop", key];
		if (typeof count === "number") command.push(count);
		super(command, opts);
	}
};
var SRandMemberCommand = class extends Command {
	constructor([key, count], opts) {
		const command = ["srandmember", key];
		if (typeof count === "number") command.push(count);
		super(command, opts);
	}
};
var SRemCommand = class extends Command {
	constructor(cmd, opts) {
		super(["srem", ...cmd], opts);
	}
};
var SScanCommand = class extends Command {
	constructor([key, cursor, opts], cmdOpts) {
		const command = [
			"sscan",
			key,
			cursor
		];
		if (opts?.match) command.push("match", opts.match);
		if (typeof opts?.count === "number") command.push("count", opts.count);
		super(command, {
			deserialize: deserializeScanResponse,
			...cmdOpts
		});
	}
};
var StrLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["strlen", ...cmd], opts);
	}
};
var SUnionCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sunion", ...cmd], opts);
	}
};
var SUnionStoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["sunionstore", ...cmd], opts);
	}
};
var TimeCommand = class extends Command {
	constructor(opts) {
		super(["time"], opts);
	}
};
var TouchCommand = class extends Command {
	constructor(cmd, opts) {
		super(["touch", ...cmd], opts);
	}
};
var TtlCommand = class extends Command {
	constructor(cmd, opts) {
		super(["ttl", ...cmd], opts);
	}
};
var TypeCommand = class extends Command {
	constructor(cmd, opts) {
		super(["type", ...cmd], opts);
	}
};
var UnlinkCommand = class extends Command {
	constructor(cmd, opts) {
		super(["unlink", ...cmd], opts);
	}
};
var XAckCommand = class extends Command {
	constructor([key, group, id], opts) {
		const ids = Array.isArray(id) ? [...id] : [id];
		super([
			"XACK",
			key,
			group,
			...ids
		], opts);
	}
};
var XAckDelCommand = class extends Command {
	constructor([key, group, opts, ...ids], cmdOpts) {
		const command = [
			"XACKDEL",
			key,
			group
		];
		command.push(opts.toUpperCase(), "IDS", ids.length, ...ids);
		super(command, cmdOpts);
	}
};
var XAddCommand = class extends Command {
	constructor([key, id, entries, opts], commandOptions) {
		const command = ["XADD", key];
		if (opts) {
			if (opts.nomkStream) command.push("NOMKSTREAM");
			if (opts.trim) {
				command.push(opts.trim.type, opts.trim.comparison, opts.trim.threshold);
				if (opts.trim.limit !== void 0) command.push("LIMIT", opts.trim.limit);
			}
		}
		command.push(id);
		for (const [k, v] of Object.entries(entries)) command.push(k, v);
		super(command, commandOptions);
	}
};
var XAutoClaim = class extends Command {
	constructor([key, group, consumer, minIdleTime, start, options], opts) {
		const commands = [];
		if (options?.count) commands.push("COUNT", options.count);
		if (options?.justId) commands.push("JUSTID");
		super([
			"XAUTOCLAIM",
			key,
			group,
			consumer,
			minIdleTime,
			start,
			...commands
		], opts);
	}
};
var XClaimCommand = class extends Command {
	constructor([key, group, consumer, minIdleTime, id, options], opts) {
		const ids = Array.isArray(id) ? [...id] : [id];
		const commands = [];
		if (options?.idleMS) commands.push("IDLE", options.idleMS);
		if (options?.idleMS) commands.push("TIME", options.timeMS);
		if (options?.retryCount) commands.push("RETRYCOUNT", options.retryCount);
		if (options?.force) commands.push("FORCE");
		if (options?.justId) commands.push("JUSTID");
		if (options?.lastId) commands.push("LASTID", options.lastId);
		super([
			"XCLAIM",
			key,
			group,
			consumer,
			minIdleTime,
			...ids,
			...commands
		], opts);
	}
};
var XDelCommand = class extends Command {
	constructor([key, ids], opts) {
		const cmds = Array.isArray(ids) ? [...ids] : [ids];
		super([
			"XDEL",
			key,
			...cmds
		], opts);
	}
};
var XDelExCommand = class extends Command {
	constructor([key, opts, ...ids], cmdOpts) {
		const command = ["XDELEX", key];
		if (opts) command.push(opts.toUpperCase());
		command.push("IDS", ids.length, ...ids);
		super(command, cmdOpts);
	}
};
var XGroupCommand = class extends Command {
	constructor([key, opts], commandOptions) {
		const command = ["XGROUP"];
		switch (opts.type) {
			case "CREATE":
				command.push("CREATE", key, opts.group, opts.id);
				if (opts.options) {
					if (opts.options.MKSTREAM) command.push("MKSTREAM");
					if (opts.options.ENTRIESREAD !== void 0) command.push("ENTRIESREAD", opts.options.ENTRIESREAD.toString());
				}
				break;
			case "CREATECONSUMER":
				command.push("CREATECONSUMER", key, opts.group, opts.consumer);
				break;
			case "DELCONSUMER":
				command.push("DELCONSUMER", key, opts.group, opts.consumer);
				break;
			case "DESTROY":
				command.push("DESTROY", key, opts.group);
				break;
			case "SETID":
				command.push("SETID", key, opts.group, opts.id);
				if (opts.options?.ENTRIESREAD !== void 0) command.push("ENTRIESREAD", opts.options.ENTRIESREAD.toString());
				break;
			default: throw new Error("Invalid XGROUP");
		}
		super(command, commandOptions);
	}
};
var XInfoCommand = class extends Command {
	constructor([key, options], opts) {
		const cmds = [];
		if (options.type === "CONSUMERS") cmds.push("CONSUMERS", key, options.group);
		else cmds.push("GROUPS", key);
		super(["XINFO", ...cmds], opts);
	}
};
var XLenCommand = class extends Command {
	constructor(cmd, opts) {
		super(["XLEN", ...cmd], opts);
	}
};
var XPendingCommand = class extends Command {
	constructor([key, group, start, end, count, options], opts) {
		const consumers = options?.consumer === void 0 ? [] : Array.isArray(options.consumer) ? [...options.consumer] : [options.consumer];
		super([
			"XPENDING",
			key,
			group,
			...options?.idleTime ? ["IDLE", options.idleTime] : [],
			start,
			end,
			count,
			...consumers
		], opts);
	}
};
function deserialize6(result) {
	const obj = {};
	for (const e of result) for (let i = 0; i < e.length; i += 2) {
		const streamId = e[i];
		const entries = e[i + 1];
		if (!(streamId in obj)) obj[streamId] = {};
		for (let j = 0; j < entries.length; j += 2) {
			const field = entries[j];
			const value = entries[j + 1];
			try {
				obj[streamId][field] = JSON.parse(value);
			} catch {
				obj[streamId][field] = value;
			}
		}
	}
	return obj;
}
var XRangeCommand = class extends Command {
	constructor([key, start, end, count], opts) {
		const command = [
			"XRANGE",
			key,
			start,
			end
		];
		if (typeof count === "number") command.push("COUNT", count);
		super(command, {
			deserialize: (result) => deserialize6(result),
			...opts
		});
	}
};
var UNBALANCED_XREAD_ERR = "ERR Unbalanced XREAD list of streams: for each stream key an ID or '$' must be specified";
var XReadCommand = class extends Command {
	constructor([key, id, options], opts) {
		if (Array.isArray(key) && Array.isArray(id) && key.length !== id.length) throw new Error(UNBALANCED_XREAD_ERR);
		const commands = [];
		if (typeof options?.count === "number") commands.push("COUNT", options.count);
		if (typeof options?.blockMS === "number") commands.push("BLOCK", options.blockMS);
		commands.push("STREAMS", ...Array.isArray(key) ? [...key] : [key], ...Array.isArray(id) ? [...id] : [id]);
		super(["XREAD", ...commands], opts);
	}
};
var UNBALANCED_XREADGROUP_ERR = "ERR Unbalanced XREADGROUP list of streams: for each stream key an ID or '$' must be specified";
var XReadGroupCommand = class extends Command {
	constructor([group, consumer, key, id, options], opts) {
		if (Array.isArray(key) && Array.isArray(id) && key.length !== id.length) throw new Error(UNBALANCED_XREADGROUP_ERR);
		const commands = [];
		if (typeof options?.count === "number") commands.push("COUNT", options.count);
		if (typeof options?.blockMS === "number") commands.push("BLOCK", options.blockMS);
		if (typeof options?.NOACK === "boolean" && options.NOACK) commands.push("NOACK");
		commands.push("STREAMS", ...Array.isArray(key) ? [...key] : [key], ...Array.isArray(id) ? [...id] : [id]);
		super([
			"XREADGROUP",
			"GROUP",
			group,
			consumer,
			...commands
		], opts);
	}
};
var XRevRangeCommand = class extends Command {
	constructor([key, end, start, count], opts) {
		const command = [
			"XREVRANGE",
			key,
			end,
			start
		];
		if (typeof count === "number") command.push("COUNT", count);
		super(command, {
			deserialize: (result) => deserialize7(result),
			...opts
		});
	}
};
function deserialize7(result) {
	const obj = {};
	for (const e of result) for (let i = 0; i < e.length; i += 2) {
		const streamId = e[i];
		const entries = e[i + 1];
		if (!(streamId in obj)) obj[streamId] = {};
		for (let j = 0; j < entries.length; j += 2) {
			const field = entries[j];
			const value = entries[j + 1];
			try {
				obj[streamId][field] = JSON.parse(value);
			} catch {
				obj[streamId][field] = value;
			}
		}
	}
	return obj;
}
var XTrimCommand = class extends Command {
	constructor([key, options], opts) {
		const { limit, strategy, threshold, exactness = "~" } = options;
		super([
			"XTRIM",
			key,
			strategy,
			exactness,
			threshold,
			...limit ? ["LIMIT", limit] : []
		], opts);
	}
};
var ZAddCommand = class extends Command {
	constructor([key, arg1, ...arg2], opts) {
		const command = ["zadd", key];
		if ("nx" in arg1 && arg1.nx) command.push("nx");
		else if ("xx" in arg1 && arg1.xx) command.push("xx");
		if ("ch" in arg1 && arg1.ch) command.push("ch");
		if ("incr" in arg1 && arg1.incr) command.push("incr");
		if ("lt" in arg1 && arg1.lt) command.push("lt");
		else if ("gt" in arg1 && arg1.gt) command.push("gt");
		if ("score" in arg1 && "member" in arg1) command.push(arg1.score, arg1.member);
		command.push(...arg2.flatMap(({ score, member }) => [score, member]));
		super(command, opts);
	}
};
var ZCardCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zcard", ...cmd], opts);
	}
};
var ZCountCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zcount", ...cmd], opts);
	}
};
var ZIncrByCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zincrby", ...cmd], opts);
	}
};
var ZInterStoreCommand = class extends Command {
	constructor([destination, numKeys, keyOrKeys, opts], cmdOpts) {
		const command = [
			"zinterstore",
			destination,
			numKeys
		];
		if (Array.isArray(keyOrKeys)) command.push(...keyOrKeys);
		else command.push(keyOrKeys);
		if (opts) {
			if ("weights" in opts && opts.weights) command.push("weights", ...opts.weights);
			else if ("weight" in opts && typeof opts.weight === "number") command.push("weights", opts.weight);
			if ("aggregate" in opts) command.push("aggregate", opts.aggregate);
		}
		super(command, cmdOpts);
	}
};
var ZLexCountCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zlexcount", ...cmd], opts);
	}
};
var ZPopMaxCommand = class extends Command {
	constructor([key, count], opts) {
		const command = ["zpopmax", key];
		if (typeof count === "number") command.push(count);
		super(command, opts);
	}
};
var ZPopMinCommand = class extends Command {
	constructor([key, count], opts) {
		const command = ["zpopmin", key];
		if (typeof count === "number") command.push(count);
		super(command, opts);
	}
};
var ZRangeCommand = class extends Command {
	constructor([key, min, max, opts], cmdOpts) {
		const command = [
			"zrange",
			key,
			min,
			max
		];
		if (opts?.byScore) command.push("byscore");
		if (opts?.byLex) command.push("bylex");
		if (opts?.rev) command.push("rev");
		if (opts?.count !== void 0 && opts.offset !== void 0) command.push("limit", opts.offset, opts.count);
		if (opts?.withScores) command.push("withscores");
		super(command, cmdOpts);
	}
};
var ZRankCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zrank", ...cmd], opts);
	}
};
var ZRemCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zrem", ...cmd], opts);
	}
};
var ZRemRangeByLexCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zremrangebylex", ...cmd], opts);
	}
};
var ZRemRangeByRankCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zremrangebyrank", ...cmd], opts);
	}
};
var ZRemRangeByScoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zremrangebyscore", ...cmd], opts);
	}
};
var ZRevRankCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zrevrank", ...cmd], opts);
	}
};
var ZScanCommand = class extends Command {
	constructor([key, cursor, opts], cmdOpts) {
		const command = [
			"zscan",
			key,
			cursor
		];
		if (opts?.match) command.push("match", opts.match);
		if (typeof opts?.count === "number") command.push("count", opts.count);
		super(command, {
			deserialize: deserializeScanResponse,
			...cmdOpts
		});
	}
};
var ZScoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zscore", ...cmd], opts);
	}
};
var ZUnionCommand = class extends Command {
	constructor([numKeys, keyOrKeys, opts], cmdOpts) {
		const command = ["zunion", numKeys];
		if (Array.isArray(keyOrKeys)) command.push(...keyOrKeys);
		else command.push(keyOrKeys);
		if (opts) {
			if ("weights" in opts && opts.weights) command.push("weights", ...opts.weights);
			else if ("weight" in opts && typeof opts.weight === "number") command.push("weights", opts.weight);
			if ("aggregate" in opts) command.push("aggregate", opts.aggregate);
			if (opts.withScores) command.push("withscores");
		}
		super(command, cmdOpts);
	}
};
var ZUnionStoreCommand = class extends Command {
	constructor([destination, numKeys, keyOrKeys, opts], cmdOpts) {
		const command = [
			"zunionstore",
			destination,
			numKeys
		];
		if (Array.isArray(keyOrKeys)) command.push(...keyOrKeys);
		else command.push(keyOrKeys);
		if (opts) {
			if ("weights" in opts && opts.weights) command.push("weights", ...opts.weights);
			else if ("weight" in opts && typeof opts.weight === "number") command.push("weights", opts.weight);
			if ("aggregate" in opts) command.push("aggregate", opts.aggregate);
		}
		super(command, cmdOpts);
	}
};
var ZDiffStoreCommand = class extends Command {
	constructor(cmd, opts) {
		super(["zdiffstore", ...cmd], opts);
	}
};
var ZMScoreCommand = class extends Command {
	constructor(cmd, opts) {
		const [key, members] = cmd;
		super([
			"zmscore",
			key,
			...members
		], opts);
	}
};
var Pipeline = class {
	client;
	commands;
	commandOptions;
	multiExec;
	constructor(opts) {
		this.client = opts.client;
		this.commands = [];
		this.commandOptions = opts.commandOptions;
		this.multiExec = opts.multiExec ?? false;
		if (this.commandOptions?.latencyLogging) {
			const originalExec = this.exec.bind(this);
			this.exec = async (options) => {
				const start = performance.now();
				const result = await (options ? originalExec(options) : originalExec());
				const loggerResult = (performance.now() - start).toFixed(2);
				console.log(`Latency for \x1B[38;2;19;185;39m${this.multiExec ? ["MULTI-EXEC"] : ["PIPELINE"].toString().toUpperCase()}\x1B[0m: \x1B[38;2;0;255;255m${loggerResult} ms\x1B[0m`);
				return result;
			};
		}
	}
	exec = async (options) => {
		if (this.commands.length === 0) throw new Error("Pipeline is empty");
		const path = this.multiExec ? ["multi-exec"] : ["pipeline"];
		const res = await this.client.request({
			path,
			body: Object.values(this.commands).map((c) => c.command)
		});
		return options?.keepErrors ? res.map(({ error, result }, i) => {
			return {
				error,
				result: this.commands[i].deserialize(result)
			};
		}) : res.map(({ error, result }, i) => {
			if (error) throw new UpstashError(`Command ${i + 1} [ ${this.commands[i].command[0]} ] failed: ${error}`);
			return this.commands[i].deserialize(result);
		});
	};
	/**
	* Returns the length of pipeline before the execution
	*/
	length() {
		return this.commands.length;
	}
	/**
	* Pushes a command into the pipeline and returns a chainable instance of the
	* pipeline
	*/
	chain(command) {
		this.commands.push(command);
		return this;
	}
	/**
	* @see https://redis.io/commands/append
	*/
	append = (...args) => this.chain(new AppendCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arcount
	*/
	arcount = (...args) => this.chain(new ArCountCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/ardel
	*/
	ardel = (...args) => this.chain(new ArDelCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/ardelrange
	*/
	ardelrange = (...args) => this.chain(new ArDelRangeCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arget
	*/
	arget = (...args) => this.chain(new ArGetCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/argetrange
	*/
	argetrange = (...args) => this.chain(new ArGetRangeCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/argrep
	*/
	argrep = (key, start, end, opts) => this.chain(new ArGrepCommand([
		key,
		start,
		end,
		opts
	], this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arinfo
	*/
	arinfo = (...args) => this.chain(new ArInfoCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arinsert
	*/
	arinsert = (key, ...values) => this.chain(new ArInsertCommand([key, ...values], this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arlastitems
	*/
	arlastitems = (...args) => this.chain(new ArLastItemsCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arlen
	*/
	arlen = (...args) => this.chain(new ArLenCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/armget
	*/
	armget = (...args) => this.chain(new ArMGetCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/armset
	*/
	armset = (key, values) => this.chain(new ArMSetCommand([key, values], this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arnext
	*/
	arnext = (...args) => this.chain(new ArNextCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arop
	*/
	arop = (key, start, end, operation) => this.chain(new ArOpCommand([
		key,
		start,
		end,
		operation
	], this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arring
	*/
	arring = (key, size, ...values) => this.chain(new ArRingCommand([
		key,
		size,
		...values
	], this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arscan
	*/
	arscan = (...args) => this.chain(new ArScanCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arseek
	*/
	arseek = (...args) => this.chain(new ArSeekCommand(args, this.commandOptions));
	/**
	* @see https://upstash.com/docs/redis/commands/array/arset
	*/
	arset = (key, index, ...values) => this.chain(new ArSetCommand([
		key,
		index,
		...values
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/bitcount
	*/
	bitcount = (...args) => this.chain(new BitCountCommand(args, this.commandOptions));
	/**
	* Returns an instance that can be used to execute `BITFIELD` commands on one key.
	*
	* @example
	* ```typescript
	* redis.set("mykey", 0);
	* const result = await redis.pipeline()
	*   .bitfield("mykey")
	*   .set("u4", 0, 16)
	*   .incr("u4", "#1", 1)
	*   .exec();
	* console.log(result); // [[0, 1]]
	* ```
	*
	* @see https://redis.io/commands/bitfield
	*/
	bitfield = (...args) => new BitFieldCommand(args, this.client, this.commandOptions, this.chain.bind(this));
	/**
	* @see https://redis.io/commands/bitop
	*/
	bitop = (op, destinationKey, sourceKey, ...sourceKeys) => this.chain(new BitOpCommand([
		op,
		destinationKey,
		sourceKey,
		...sourceKeys
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/bitpos
	*/
	bitpos = (...args) => this.chain(new BitPosCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/client-setinfo
	*/
	clientSetinfo = (...args) => this.chain(new ClientSetInfoCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/copy
	*/
	copy = (...args) => this.chain(new CopyCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zdiffstore
	*/
	zdiffstore = (...args) => this.chain(new ZDiffStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/dbsize
	*/
	dbsize = () => this.chain(new DBSizeCommand(this.commandOptions));
	/**
	* @see https://redis.io/commands/decr
	*/
	decr = (...args) => this.chain(new DecrCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/decrby
	*/
	decrby = (...args) => this.chain(new DecrByCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/del
	*/
	del = (...args) => this.chain(new DelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/echo
	*/
	echo = (...args) => this.chain(new EchoCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/eval_ro
	*/
	evalRo = (...args) => this.chain(new EvalROCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/eval
	*/
	eval = (...args) => this.chain(new EvalCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/evalsha_ro
	*/
	evalshaRo = (...args) => this.chain(new EvalshaROCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/evalsha
	*/
	evalsha = (...args) => this.chain(new EvalshaCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/exists
	*/
	exists = (...args) => this.chain(new ExistsCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/expire
	*/
	expire = (...args) => this.chain(new ExpireCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/expireat
	*/
	expireat = (...args) => this.chain(new ExpireAtCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/flushall
	*/
	flushall = (args) => this.chain(new FlushAllCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/flushdb
	*/
	flushdb = (...args) => this.chain(new FlushDBCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geoadd
	*/
	geoadd = (...args) => this.chain(new GeoAddCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geodist
	*/
	geodist = (...args) => this.chain(new GeoDistCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geopos
	*/
	geopos = (...args) => this.chain(new GeoPosCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geohash
	*/
	geohash = (...args) => this.chain(new GeoHashCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geosearch
	*/
	geosearch = (...args) => this.chain(new GeoSearchCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/geosearchstore
	*/
	geosearchstore = (...args) => this.chain(new GeoSearchStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/get
	*/
	get = (...args) => this.chain(new GetCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/getbit
	*/
	getbit = (...args) => this.chain(new GetBitCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/getdel
	*/
	getdel = (...args) => this.chain(new GetDelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/getex
	*/
	getex = (...args) => this.chain(new GetExCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/getrange
	*/
	getrange = (...args) => this.chain(new GetRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/getset
	*/
	getset = (key, value) => this.chain(new GetSetCommand([key, value], this.commandOptions));
	/**
	* @see https://redis.io/commands/hdel
	*/
	hdel = (...args) => this.chain(new HDelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hexists
	*/
	hexists = (...args) => this.chain(new HExistsCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hexpire
	*/
	hexpire = (...args) => this.chain(new HExpireCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hexpireat
	*/
	hexpireat = (...args) => this.chain(new HExpireAtCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hexpiretime
	*/
	hexpiretime = (...args) => this.chain(new HExpireTimeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/httl
	*/
	httl = (...args) => this.chain(new HTtlCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hpexpire
	*/
	hpexpire = (...args) => this.chain(new HPExpireCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hpexpireat
	*/
	hpexpireat = (...args) => this.chain(new HPExpireAtCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hpexpiretime
	*/
	hpexpiretime = (...args) => this.chain(new HPExpireTimeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hpttl
	*/
	hpttl = (...args) => this.chain(new HPTtlCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hpersist
	*/
	hpersist = (...args) => this.chain(new HPersistCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hget
	*/
	hget = (...args) => this.chain(new HGetCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hgetall
	*/
	hgetall = (...args) => this.chain(new HGetAllCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hgetdel
	*/
	hgetdel = (...args) => this.chain(new HGetDelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hgetex
	*/
	hgetex = (...args) => this.chain(new HGetExCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hincrby
	*/
	hincrby = (...args) => this.chain(new HIncrByCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hincrbyfloat
	*/
	hincrbyfloat = (...args) => this.chain(new HIncrByFloatCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hkeys
	*/
	hkeys = (...args) => this.chain(new HKeysCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hlen
	*/
	hlen = (...args) => this.chain(new HLenCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hmget
	*/
	hmget = (...args) => this.chain(new HMGetCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hmset
	*/
	hmset = (key, kv) => this.chain(new HMSetCommand([key, kv], this.commandOptions));
	/**
	* @see https://redis.io/commands/hrandfield
	*/
	hrandfield = (key, count, withValues) => this.chain(new HRandFieldCommand([
		key,
		count,
		withValues
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/hscan
	*/
	hscan = (...args) => this.chain(new HScanCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hset
	*/
	hset = (key, kv) => this.chain(new HSetCommand([key, kv], this.commandOptions));
	/**
	* @see https://redis.io/commands/hsetex
	*/
	hsetex = (...args) => this.chain(new HSetExCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hsetnx
	*/
	hsetnx = (key, field, value) => this.chain(new HSetNXCommand([
		key,
		field,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/hstrlen
	*/
	hstrlen = (...args) => this.chain(new HStrLenCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/hvals
	*/
	hvals = (...args) => this.chain(new HValsCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/incr
	*/
	incr = (...args) => this.chain(new IncrCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/incrby
	*/
	incrby = (...args) => this.chain(new IncrByCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/incrbyfloat
	*/
	incrbyfloat = (...args) => this.chain(new IncrByFloatCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/keys
	*/
	keys = (...args) => this.chain(new KeysCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lindex
	*/
	lindex = (...args) => this.chain(new LIndexCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/linsert
	*/
	linsert = (key, direction, pivot, value) => this.chain(new LInsertCommand([
		key,
		direction,
		pivot,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/llen
	*/
	llen = (...args) => this.chain(new LLenCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lmove
	*/
	lmove = (...args) => this.chain(new LMoveCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lpop
	*/
	lpop = (...args) => this.chain(new LPopCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lmpop
	*/
	lmpop = (...args) => this.chain(new LmPopCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lpos
	*/
	lpos = (...args) => this.chain(new LPosCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lpush
	*/
	lpush = (key, ...elements) => this.chain(new LPushCommand([key, ...elements], this.commandOptions));
	/**
	* @see https://redis.io/commands/lpushx
	*/
	lpushx = (key, ...elements) => this.chain(new LPushXCommand([key, ...elements], this.commandOptions));
	/**
	* @see https://redis.io/commands/lrange
	*/
	lrange = (...args) => this.chain(new LRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/lrem
	*/
	lrem = (key, count, value) => this.chain(new LRemCommand([
		key,
		count,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/lset
	*/
	lset = (key, index, value) => this.chain(new LSetCommand([
		key,
		index,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/ltrim
	*/
	ltrim = (...args) => this.chain(new LTrimCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/mget
	*/
	mget = (...args) => this.chain(new MGetCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/mset
	*/
	mset = (kv) => this.chain(new MSetCommand([kv], this.commandOptions));
	/**
	* @see https://redis.io/commands/msetnx
	*/
	msetnx = (kv) => this.chain(new MSetNXCommand([kv], this.commandOptions));
	/**
	* @see https://redis.io/commands/persist
	*/
	persist = (...args) => this.chain(new PersistCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/pexpire
	*/
	pexpire = (...args) => this.chain(new PExpireCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/pexpireat
	*/
	pexpireat = (...args) => this.chain(new PExpireAtCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/pfadd
	*/
	pfadd = (...args) => this.chain(new PfAddCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/pfcount
	*/
	pfcount = (...args) => this.chain(new PfCountCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/pfmerge
	*/
	pfmerge = (...args) => this.chain(new PfMergeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/ping
	*/
	ping = (args) => this.chain(new PingCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/psetex
	*/
	psetex = (key, ttl, value) => this.chain(new PSetEXCommand([
		key,
		ttl,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/pttl
	*/
	pttl = (...args) => this.chain(new PTtlCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/publish
	*/
	publish = (...args) => this.chain(new PublishCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/randomkey
	*/
	randomkey = () => this.chain(new RandomKeyCommand(this.commandOptions));
	/**
	* @see https://redis.io/commands/rename
	*/
	rename = (...args) => this.chain(new RenameCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/renamenx
	*/
	renamenx = (...args) => this.chain(new RenameNXCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/rpop
	*/
	rpop = (...args) => this.chain(new RPopCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/rpush
	*/
	rpush = (key, ...elements) => this.chain(new RPushCommand([key, ...elements], this.commandOptions));
	/**
	* @see https://redis.io/commands/rpushx
	*/
	rpushx = (key, ...elements) => this.chain(new RPushXCommand([key, ...elements], this.commandOptions));
	/**
	* @see https://redis.io/commands/sadd
	*/
	sadd = (key, member, ...members) => this.chain(new SAddCommand([
		key,
		member,
		...members
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/scan
	*/
	scan = (...args) => this.chain(new ScanCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/scard
	*/
	scard = (...args) => this.chain(new SCardCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/script-exists
	*/
	scriptExists = (...args) => this.chain(new ScriptExistsCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/script-flush
	*/
	scriptFlush = (...args) => this.chain(new ScriptFlushCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/script-load
	*/
	scriptLoad = (...args) => this.chain(new ScriptLoadCommand(args, this.commandOptions));
	sdiff = (...args) => this.chain(new SDiffCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sdiffstore
	*/
	sdiffstore = (...args) => this.chain(new SDiffStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/set
	*/
	set = (key, value, opts) => this.chain(new SetCommand([
		key,
		value,
		opts
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/setbit
	*/
	setbit = (...args) => this.chain(new SetBitCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/setex
	*/
	setex = (key, ttl, value) => this.chain(new SetExCommand([
		key,
		ttl,
		value
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/setnx
	*/
	setnx = (key, value) => this.chain(new SetNxCommand([key, value], this.commandOptions));
	/**
	* @see https://redis.io/commands/setrange
	*/
	setrange = (...args) => this.chain(new SetRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sinter
	*/
	sinter = (...args) => this.chain(new SInterCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sintercard
	*/
	sintercard = (...args) => this.chain(new SInterCardCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sinterstore
	*/
	sinterstore = (...args) => this.chain(new SInterStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sismember
	*/
	sismember = (key, member) => this.chain(new SIsMemberCommand([key, member], this.commandOptions));
	/**
	* @see https://redis.io/commands/smembers
	*/
	smembers = (...args) => this.chain(new SMembersCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/smismember
	*/
	smismember = (key, members) => this.chain(new SMIsMemberCommand([key, members], this.commandOptions));
	/**
	* @see https://redis.io/commands/smove
	*/
	smove = (source, destination, member) => this.chain(new SMoveCommand([
		source,
		destination,
		member
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/spop
	*/
	spop = (...args) => this.chain(new SPopCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/srandmember
	*/
	srandmember = (...args) => this.chain(new SRandMemberCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/srem
	*/
	srem = (key, ...members) => this.chain(new SRemCommand([key, ...members], this.commandOptions));
	/**
	* @see https://redis.io/commands/sscan
	*/
	sscan = (...args) => this.chain(new SScanCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/strlen
	*/
	strlen = (...args) => this.chain(new StrLenCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sunion
	*/
	sunion = (...args) => this.chain(new SUnionCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/sunionstore
	*/
	sunionstore = (...args) => this.chain(new SUnionStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/time
	*/
	time = () => this.chain(new TimeCommand(this.commandOptions));
	/**
	* @see https://redis.io/commands/touch
	*/
	touch = (...args) => this.chain(new TouchCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/ttl
	*/
	ttl = (...args) => this.chain(new TtlCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/type
	*/
	type = (...args) => this.chain(new TypeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/unlink
	*/
	unlink = (...args) => this.chain(new UnlinkCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zadd
	*/
	zadd = (...args) => {
		if ("score" in args[1]) return this.chain(new ZAddCommand([
			args[0],
			args[1],
			...args.slice(2)
		], this.commandOptions));
		return this.chain(new ZAddCommand([
			args[0],
			args[1],
			...args.slice(2)
		], this.commandOptions));
	};
	/**
	* @see https://redis.io/commands/xadd
	*/
	xadd = (...args) => this.chain(new XAddCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xack
	*/
	xack = (...args) => this.chain(new XAckCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xackdel
	*/
	xackdel = (...args) => this.chain(new XAckDelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xdel
	*/
	xdel = (...args) => this.chain(new XDelCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xdelex
	*/
	xdelex = (...args) => this.chain(new XDelExCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xgroup
	*/
	xgroup = (...args) => this.chain(new XGroupCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xread
	*/
	xread = (...args) => this.chain(new XReadCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xreadgroup
	*/
	xreadgroup = (...args) => this.chain(new XReadGroupCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xinfo
	*/
	xinfo = (...args) => this.chain(new XInfoCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xlen
	*/
	xlen = (...args) => this.chain(new XLenCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xpending
	*/
	xpending = (...args) => this.chain(new XPendingCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xclaim
	*/
	xclaim = (...args) => this.chain(new XClaimCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xautoclaim
	*/
	xautoclaim = (...args) => this.chain(new XAutoClaim(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xtrim
	*/
	xtrim = (...args) => this.chain(new XTrimCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xrange
	*/
	xrange = (...args) => this.chain(new XRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/xrevrange
	*/
	xrevrange = (...args) => this.chain(new XRevRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zcard
	*/
	zcard = (...args) => this.chain(new ZCardCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zcount
	*/
	zcount = (...args) => this.chain(new ZCountCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zincrby
	*/
	zincrby = (key, increment, member) => this.chain(new ZIncrByCommand([
		key,
		increment,
		member
	], this.commandOptions));
	/**
	* @see https://redis.io/commands/zinterstore
	*/
	zinterstore = (...args) => this.chain(new ZInterStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zlexcount
	*/
	zlexcount = (...args) => this.chain(new ZLexCountCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zmscore
	*/
	zmscore = (...args) => this.chain(new ZMScoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zpopmax
	*/
	zpopmax = (...args) => this.chain(new ZPopMaxCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zpopmin
	*/
	zpopmin = (...args) => this.chain(new ZPopMinCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zrange
	*/
	zrange = (...args) => this.chain(new ZRangeCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zrank
	*/
	zrank = (key, member) => this.chain(new ZRankCommand([key, member], this.commandOptions));
	/**
	* @see https://redis.io/commands/zrem
	*/
	zrem = (key, ...members) => this.chain(new ZRemCommand([key, ...members], this.commandOptions));
	/**
	* @see https://redis.io/commands/zremrangebylex
	*/
	zremrangebylex = (...args) => this.chain(new ZRemRangeByLexCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zremrangebyrank
	*/
	zremrangebyrank = (...args) => this.chain(new ZRemRangeByRankCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zremrangebyscore
	*/
	zremrangebyscore = (...args) => this.chain(new ZRemRangeByScoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zrevrank
	*/
	zrevrank = (key, member) => this.chain(new ZRevRankCommand([key, member], this.commandOptions));
	/**
	* @see https://redis.io/commands/zscan
	*/
	zscan = (...args) => this.chain(new ZScanCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zscore
	*/
	zscore = (key, member) => this.chain(new ZScoreCommand([key, member], this.commandOptions));
	/**
	* @see https://redis.io/commands/zunionstore
	*/
	zunionstore = (...args) => this.chain(new ZUnionStoreCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/zunion
	*/
	zunion = (...args) => this.chain(new ZUnionCommand(args, this.commandOptions));
	/**
	* @see https://redis.io/commands/?group=json
	*/
	get json() {
		return {
			/**
			* @see https://redis.io/commands/json.arrappend
			*/
			arrappend: (...args) => this.chain(new JsonArrAppendCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.arrindex
			*/
			arrindex: (...args) => this.chain(new JsonArrIndexCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.arrinsert
			*/
			arrinsert: (...args) => this.chain(new JsonArrInsertCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.arrlen
			*/
			arrlen: (...args) => this.chain(new JsonArrLenCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.arrpop
			*/
			arrpop: (...args) => this.chain(new JsonArrPopCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.arrtrim
			*/
			arrtrim: (...args) => this.chain(new JsonArrTrimCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.clear
			*/
			clear: (...args) => this.chain(new JsonClearCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.del
			*/
			del: (...args) => this.chain(new JsonDelCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.forget
			*/
			forget: (...args) => this.chain(new JsonForgetCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.get
			*/
			get: (...args) => this.chain(new JsonGetCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.merge
			*/
			merge: (...args) => this.chain(new JsonMergeCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.mget
			*/
			mget: (...args) => this.chain(new JsonMGetCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.mset
			*/
			mset: (...args) => this.chain(new JsonMSetCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.numincrby
			*/
			numincrby: (...args) => this.chain(new JsonNumIncrByCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.nummultby
			*/
			nummultby: (...args) => this.chain(new JsonNumMultByCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.objkeys
			*/
			objkeys: (...args) => this.chain(new JsonObjKeysCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.objlen
			*/
			objlen: (...args) => this.chain(new JsonObjLenCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.resp
			*/
			resp: (...args) => this.chain(new JsonRespCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.set
			*/
			set: (...args) => this.chain(new JsonSetCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.strappend
			*/
			strappend: (...args) => this.chain(new JsonStrAppendCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.strlen
			*/
			strlen: (...args) => this.chain(new JsonStrLenCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.toggle
			*/
			toggle: (...args) => this.chain(new JsonToggleCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/commands/json.type
			*/
			type: (...args) => this.chain(new JsonTypeCommand(args, this.commandOptions))
		};
	}
	get functions() {
		return {
			/**
			* @see https://redis.io/docs/latest/commands/function-load/
			*/
			load: (...args) => this.chain(new FunctionLoadCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/function-list/
			*/
			list: (...args) => this.chain(new FunctionListCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/function-delete/
			*/
			delete: (...args) => this.chain(new FunctionDeleteCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/function-flush/
			*/
			flush: () => this.chain(new FunctionFlushCommand(this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/function-stats/
			*/
			stats: () => this.chain(new FunctionStatsCommand(this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/fcall/
			*/
			call: (...args) => this.chain(new FCallCommand(args, this.commandOptions)),
			/**
			* @see https://redis.io/docs/latest/commands/fcall_ro/
			*/
			callRo: (...args) => this.chain(new FCallRoCommand(args, this.commandOptions))
		};
	}
};
var MAX_PIPELINE_SIZE = 1e3;
var READ_COMMANDS = /* @__PURE__ */ new Set([
	"arcount",
	"arget",
	"argetrange",
	"argrep",
	"arinfo",
	"arlastitems",
	"arlen",
	"armget",
	"arnext",
	"arop",
	"arscan",
	"get",
	"getrange",
	"mget",
	"strlen",
	"bitcount",
	"bitpos",
	"getbit",
	"hexists",
	"hget",
	"hgetall",
	"hkeys",
	"hlen",
	"hmget",
	"hrandfield",
	"hscan",
	"hstrlen",
	"httl",
	"hvals",
	"hexpiretime",
	"hpexpiretime",
	"hpttl",
	"lindex",
	"llen",
	"lpos",
	"lrange",
	"scard",
	"sdiff",
	"sinter",
	"sintercard",
	"sismember",
	"smembers",
	"smismember",
	"srandmember",
	"sscan",
	"sunion",
	"zcard",
	"zcount",
	"zlexcount",
	"zmscore",
	"zrange",
	"zrank",
	"zrevrank",
	"zscan",
	"zscore",
	"zunion",
	"exists",
	"type",
	"ttl",
	"pttl",
	"randomkey",
	"touch",
	"pfcount",
	"xinfo",
	"xlen",
	"xpending",
	"xrange",
	"xread",
	"xrevrange",
	"geodist",
	"geohash",
	"geopos",
	"geosearch",
	"scriptExists",
	"evalRo",
	"evalshaRo",
	"dbsize",
	"echo",
	"ping",
	"time",
	"scan",
	"keys",
	"arrindex",
	"arrlen",
	"objkeys",
	"objlen",
	"resp",
	"list",
	"stats",
	"callRo"
]);
var EXCLUDE_COMMANDS = /* @__PURE__ */ new Set([
	"scan",
	"keys",
	"flushdb",
	"flushall",
	"dbsize",
	"hscan",
	"hgetall",
	"hkeys",
	"lrange",
	"sscan",
	"smembers",
	"xrange",
	"xrevrange",
	"zscan",
	"zrange",
	"exec"
]);
function createAutoPipelineProxy(_redis, namespace = "root") {
	const redis = _redis;
	if (!redis.autoPipelineExecutor) redis.autoPipelineExecutor = new AutoPipelineExecutor(redis);
	return new Proxy(redis, { get: (redis2, command) => {
		if (command === "pipelineCounter") return redis2.autoPipelineExecutor.pipelineCounter;
		if (namespace === "root" && command === "json") return createAutoPipelineProxy(redis2, "json");
		if (namespace === "root" && command === "functions") return createAutoPipelineProxy(redis2, "functions");
		if (namespace === "root") {
			const commandInRedisButNotPipeline = command in redis2 && !(command in redis2.autoPipelineExecutor.pipeline);
			const isCommandExcluded = EXCLUDE_COMMANDS.has(command);
			if (commandInRedisButNotPipeline || isCommandExcluded) return redis2[command];
		}
		const pipeline = redis2.autoPipelineExecutor.pipeline;
		const targetFunction = namespace === "json" ? pipeline.json[command] : namespace === "functions" ? pipeline.functions[command] : pipeline[command];
		if (typeof targetFunction === "function") return (...args) => {
			const commandMode = READ_COMMANDS.has(command) ? "read" : "write";
			return redis2.autoPipelineExecutor.withAutoPipeline(commandMode, (pipeline2) => {
				(namespace === "json" ? pipeline2.json[command] : namespace === "functions" ? pipeline2.functions[command] : pipeline2[command])(...args);
			});
		};
		return targetFunction;
	} });
}
var AutoPipelineExecutor = class {
	pipelinePromises = /* @__PURE__ */ new WeakMap();
	activeReadPipeline = null;
	activeWritePipeline = null;
	readIndex = 0;
	writeIndex = 0;
	redis;
	pipeline;
	pipelineCounter = 0;
	constructor(redis) {
		this.redis = redis;
		this.pipeline = redis.pipeline();
	}
	async withAutoPipeline(commandMode, executeWithPipeline) {
		const isRead = commandMode === "read";
		const activePipeline = isRead ? this.activeReadPipeline : this.activeWritePipeline;
		const pipeline = activePipeline ?? this.redis.pipeline();
		if (!activePipeline) if (isRead) {
			this.activeReadPipeline = pipeline;
			this.readIndex = 0;
		} else {
			this.activeWritePipeline = pipeline;
			this.writeIndex = 0;
		}
		const index = isRead ? this.readIndex++ : this.writeIndex++;
		executeWithPipeline(pipeline);
		if (isRead && this.readIndex >= MAX_PIPELINE_SIZE) this.activeReadPipeline = null;
		else if (!isRead && this.writeIndex >= MAX_PIPELINE_SIZE) this.activeWritePipeline = null;
		const commandResult = (await this.deferExecution().then(() => {
			if (!this.pipelinePromises.has(pipeline)) {
				const pipelinePromise = pipeline.exec({ keepErrors: true });
				this.pipelineCounter += 1;
				this.pipelinePromises.set(pipeline, pipelinePromise);
				if (this.activeReadPipeline === pipeline) this.activeReadPipeline = null;
				if (this.activeWritePipeline === pipeline) this.activeWritePipeline = null;
			}
			return this.pipelinePromises.get(pipeline);
		}))[index];
		if (commandResult.error) throw new UpstashError(`Command failed: ${commandResult.error}`);
		return commandResult.result;
	}
	async deferExecution() {
		await Promise.resolve();
		await Promise.resolve();
	}
};
var PSubscribeCommand = class extends Command {
	constructor(cmd, opts) {
		const sseHeaders = {
			Accept: "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		};
		super([], {
			...opts,
			headers: sseHeaders,
			path: ["psubscribe", ...cmd],
			streamOptions: {
				isStreaming: true,
				onMessage: opts?.streamOptions?.onMessage,
				signal: opts?.streamOptions?.signal
			}
		});
	}
};
var Subscriber = class extends EventTarget {
	subscriptions;
	client;
	listeners;
	opts;
	constructor(client, channels, isPattern = false, opts) {
		super();
		this.client = client;
		this.subscriptions = /* @__PURE__ */ new Map();
		this.listeners = /* @__PURE__ */ new Map();
		this.opts = opts;
		for (const channel of channels) if (isPattern) this.subscribeToPattern(channel);
		else this.subscribeToChannel(channel);
	}
	subscribeToChannel(channel) {
		const controller = new AbortController();
		const command = new SubscribeCommand([channel], { streamOptions: {
			signal: controller.signal,
			onMessage: (data) => this.handleMessage(data, false)
		} });
		command.exec(this.client).catch((error) => {
			if (error.name !== "AbortError") this.dispatchToListeners("error", error);
		});
		this.subscriptions.set(channel, {
			command,
			controller,
			isPattern: false
		});
	}
	subscribeToPattern(pattern) {
		const controller = new AbortController();
		const command = new PSubscribeCommand([pattern], { streamOptions: {
			signal: controller.signal,
			onMessage: (data) => this.handleMessage(data, true)
		} });
		command.exec(this.client).catch((error) => {
			if (error.name !== "AbortError") this.dispatchToListeners("error", error);
		});
		this.subscriptions.set(pattern, {
			command,
			controller,
			isPattern: true
		});
	}
	handleMessage(data, isPattern) {
		const messageData = data.replace(/^data:\s*/, "");
		const firstCommaIndex = messageData.indexOf(",");
		const secondCommaIndex = messageData.indexOf(",", firstCommaIndex + 1);
		const thirdCommaIndex = isPattern ? messageData.indexOf(",", secondCommaIndex + 1) : -1;
		if (firstCommaIndex !== -1 && secondCommaIndex !== -1) {
			const type = messageData.slice(0, firstCommaIndex);
			if (isPattern && type === "pmessage" && thirdCommaIndex !== -1) {
				const pattern = messageData.slice(firstCommaIndex + 1, secondCommaIndex);
				const channel = messageData.slice(secondCommaIndex + 1, thirdCommaIndex);
				const messageStr = messageData.slice(thirdCommaIndex + 1);
				try {
					const message = this.opts?.automaticDeserialization === false ? messageStr : JSON.parse(messageStr);
					this.dispatchToListeners("pmessage", {
						pattern,
						channel,
						message
					});
					this.dispatchToListeners(`pmessage:${pattern}`, {
						pattern,
						channel,
						message
					});
				} catch (error) {
					this.dispatchToListeners("error", /* @__PURE__ */ new Error(`Failed to parse message: ${error}`));
				}
			} else {
				const channel = messageData.slice(firstCommaIndex + 1, secondCommaIndex);
				const messageStr = messageData.slice(secondCommaIndex + 1);
				try {
					if (type === "subscribe" || type === "psubscribe" || type === "unsubscribe" || type === "punsubscribe") {
						const count = Number.parseInt(messageStr);
						this.dispatchToListeners(type, count);
					} else {
						const message = this.opts?.automaticDeserialization === false ? messageStr : parseWithTryCatch(messageStr);
						this.dispatchToListeners(type, {
							channel,
							message
						});
						this.dispatchToListeners(`${type}:${channel}`, {
							channel,
							message
						});
					}
				} catch (error) {
					this.dispatchToListeners("error", /* @__PURE__ */ new Error(`Failed to parse message: ${error}`));
				}
			}
		}
	}
	dispatchToListeners(type, data) {
		const listeners = this.listeners.get(type);
		if (listeners) for (const listener of listeners) listener(data);
	}
	on(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeAllListeners() {
		this.listeners.clear();
	}
	async unsubscribe(channels) {
		if (channels) for (const channel of channels) {
			const subscription = this.subscriptions.get(channel);
			if (subscription) {
				try {
					subscription.controller.abort();
				} catch {}
				this.subscriptions.delete(channel);
			}
		}
		else {
			for (const subscription of this.subscriptions.values()) try {
				subscription.controller.abort();
			} catch {}
			this.subscriptions.clear();
			this.removeAllListeners();
		}
	}
	getSubscribedChannels() {
		return [...this.subscriptions.keys()];
	}
};
var SubscribeCommand = class extends Command {
	constructor(cmd, opts) {
		const sseHeaders = {
			Accept: "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		};
		super([], {
			...opts,
			headers: sseHeaders,
			path: ["subscribe", ...cmd],
			streamOptions: {
				isStreaming: true,
				onMessage: opts?.streamOptions?.onMessage,
				signal: opts?.streamOptions?.signal
			}
		});
	}
};
var parseWithTryCatch = (str) => {
	try {
		return JSON.parse(str);
	} catch {
		return str;
	}
};
var Script = class {
	script;
	/**
	* @deprecated This property is initialized to an empty string and will be set in the init method
	* asynchronously. Do not use this property immidiately after the constructor.
	*
	* This property is only exposed for backwards compatibility and will be removed in the
	* future major release.
	*/
	sha1;
	initPromise;
	redis;
	constructor(redis, script) {
		this.redis = redis;
		this.script = script;
		this.sha1 = "";
		this.init(script);
	}
	/**
	* Initialize the script by computing its SHA-1 hash.
	*/
	init(script) {
		if (!this.initPromise) this.initPromise = this.digest(script).then((sha1) => {
			this.sha1 = sha1;
		});
		return this.initPromise;
	}
	/**
	* Send an `EVAL` command to redis.
	*/
	async eval(keys, args) {
		await this.init(this.script);
		return await this.redis.eval(this.script, keys, args);
	}
	/**
	* Calculates the sha1 hash of the script and then calls `EVALSHA`.
	*/
	async evalsha(keys, args) {
		await this.init(this.script);
		return await this.redis.evalsha(this.sha1, keys, args);
	}
	/**
	* Optimistically try to run `EVALSHA` first.
	* If the script is not loaded in redis, it will fall back and try again with `EVAL`.
	*
	* Following calls will be able to use the cached script
	*/
	async exec(keys, args) {
		await this.init(this.script);
		return await this.redis.evalsha(this.sha1, keys, args).catch(async (error) => {
			if (error instanceof Error && error.message.toLowerCase().includes("noscript")) return await this.redis.eval(this.script, keys, args);
			throw error;
		});
	}
	/**
	* Compute the sha1 hash of the script and return its hex representation.
	*/
	async digest(s) {
		const data = new TextEncoder().encode(s);
		const hashBuffer = await subtle.digest("SHA-1", data);
		return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
	}
};
var ScriptRO = class {
	script;
	/**
	* @deprecated This property is initialized to an empty string and will be set in the init method
	* asynchronously. Do not use this property immidiately after the constructor.
	*
	* This property is only exposed for backwards compatibility and will be removed in the
	* future major release.
	*/
	sha1;
	initPromise;
	redis;
	constructor(redis, script) {
		this.redis = redis;
		this.sha1 = "";
		this.script = script;
		this.init(script);
	}
	init(script) {
		if (!this.initPromise) this.initPromise = this.digest(script).then((sha1) => {
			this.sha1 = sha1;
		});
		return this.initPromise;
	}
	/**
	* Send an `EVAL_RO` command to redis.
	*/
	async evalRo(keys, args) {
		await this.init(this.script);
		return await this.redis.evalRo(this.script, keys, args);
	}
	/**
	* Calculates the sha1 hash of the script and then calls `EVALSHA_RO`.
	*/
	async evalshaRo(keys, args) {
		await this.init(this.script);
		return await this.redis.evalshaRo(this.sha1, keys, args);
	}
	/**
	* Optimistically try to run `EVALSHA_RO` first.
	* If the script is not loaded in redis, it will fall back and try again with `EVAL_RO`.
	*
	* Following calls will be able to use the cached script
	*/
	async exec(keys, args) {
		await this.init(this.script);
		return await this.redis.evalshaRo(this.sha1, keys, args).catch(async (error) => {
			if (error instanceof Error && error.message.toLowerCase().includes("noscript")) return await this.redis.evalRo(this.script, keys, args);
			throw error;
		});
	}
	/**
	* Compute the sha1 hash of the script and return its hex representation.
	*/
	async digest(s) {
		const data = new TextEncoder().encode(s);
		const hashBuffer = await subtle.digest("SHA-1", data);
		return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
	}
};
var Redis = class {
	client;
	opts;
	enableTelemetry;
	enableAutoPipelining;
	/**
	* Create a new redis client
	*
	* @example
	* ```typescript
	* const redis = new Redis({
	*  url: "<UPSTASH_REDIS_REST_URL>",
	*  token: "<UPSTASH_REDIS_REST_TOKEN>",
	* });
	* ```
	*/
	constructor(client, opts) {
		this.client = client;
		this.opts = opts;
		this.enableTelemetry = opts?.enableTelemetry ?? true;
		if (opts?.readYourWrites === false) this.client.readYourWrites = false;
		this.enableAutoPipelining = opts?.enableAutoPipelining ?? true;
	}
	get readYourWritesSyncToken() {
		return this.client.upstashSyncToken;
	}
	set readYourWritesSyncToken(session) {
		this.client.upstashSyncToken = session;
	}
	get json() {
		return {
			/**
			* @see https://redis.io/commands/json.arrappend
			*/
			arrappend: (...args) => new JsonArrAppendCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.arrindex
			*/
			arrindex: (...args) => new JsonArrIndexCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.arrinsert
			*/
			arrinsert: (...args) => new JsonArrInsertCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.arrlen
			*/
			arrlen: (...args) => new JsonArrLenCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.arrpop
			*/
			arrpop: (...args) => new JsonArrPopCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.arrtrim
			*/
			arrtrim: (...args) => new JsonArrTrimCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.clear
			*/
			clear: (...args) => new JsonClearCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.del
			*/
			del: (...args) => new JsonDelCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.forget
			*/
			forget: (...args) => new JsonForgetCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.get
			*/
			get: (...args) => new JsonGetCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.merge
			*/
			merge: (...args) => new JsonMergeCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.mget
			*/
			mget: (...args) => new JsonMGetCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.mset
			*/
			mset: (...args) => new JsonMSetCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.numincrby
			*/
			numincrby: (...args) => new JsonNumIncrByCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.nummultby
			*/
			nummultby: (...args) => new JsonNumMultByCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.objkeys
			*/
			objkeys: (...args) => new JsonObjKeysCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.objlen
			*/
			objlen: (...args) => new JsonObjLenCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.resp
			*/
			resp: (...args) => new JsonRespCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.set
			*/
			set: (...args) => new JsonSetCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.strappend
			*/
			strappend: (...args) => new JsonStrAppendCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.strlen
			*/
			strlen: (...args) => new JsonStrLenCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.toggle
			*/
			toggle: (...args) => new JsonToggleCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/commands/json.type
			*/
			type: (...args) => new JsonTypeCommand(args, this.opts).exec(this.client)
		};
	}
	get functions() {
		return {
			/**
			* @see https://redis.io/docs/latest/commands/function-load/
			*/
			load: (...args) => new FunctionLoadCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/function-list/
			*/
			list: (...args) => new FunctionListCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/function-delete/
			*/
			delete: (...args) => new FunctionDeleteCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/function-flush/
			*/
			flush: () => new FunctionFlushCommand(this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/function-stats/
			*
			* Note: `running_script` field is not supported and therefore not included in the type.
			*/
			stats: () => new FunctionStatsCommand(this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/fcall/
			*/
			call: (...args) => new FCallCommand(args, this.opts).exec(this.client),
			/**
			* @see https://redis.io/docs/latest/commands/fcall_ro/
			*/
			callRo: (...args) => new FCallRoCommand(args, this.opts).exec(this.client)
		};
	}
	/**
	* Wrap a new middleware around the HTTP client.
	*/
	use = (middleware) => {
		const makeRequest = this.client.request.bind(this.client);
		this.client.request = (req) => middleware(req, makeRequest);
	};
	/**
	* Technically this is not private, we can hide it from intellisense by doing this
	*/
	addTelemetry = (telemetry) => {
		if (!this.enableTelemetry) return;
		try {
			this.client.mergeTelemetry(telemetry);
		} catch {}
	};
	/**
	* Creates a new script.
	*
	* Scripts offer the ability to optimistically try to execute a script without having to send the
	* entire script to the server. If the script is loaded on the server, it tries again by sending
	* the entire script. Afterwards, the script is cached on the server.
	*
	* @param script - The script to create
	* @param opts - Optional options to pass to the script `{ readonly?: boolean }`
	* @returns A new script
	*
	* @example
	* ```ts
	* const redis = new Redis({...})
	*
	* const script = redis.createScript<string>("return ARGV[1];")
	* const arg1 = await script.eval([], ["Hello World"])
	* expect(arg1, "Hello World")
	* ```
	* @example
	* ```ts
	* const redis = new Redis({...})
	*
	* const script = redis.createScript<string>("return ARGV[1];", { readonly: true })
	* const arg1 = await script.evalRo([], ["Hello World"])
	* expect(arg1, "Hello World")
	* ```
	*/
	createScript(script, opts) {
		return opts?.readonly ? new ScriptRO(this, script) : new Script(this, script);
	}
	get search() {
		return {
			createIndex: (params) => {
				return createIndex(this.client, params);
			},
			index: (params) => {
				return initIndex(this.client, params);
			},
			alias: {
				list: () => {
					return listAliases(this.client);
				},
				add: ({ indexName, alias }) => {
					return addAlias(this.client, {
						indexName,
						alias
					});
				},
				delete: ({ alias }) => {
					return delAlias(this.client, { alias });
				}
			}
		};
	}
	/**
	* Vector index commands.
	*
	* @example
	* ```typescript
	* const index = await redis.vector.createIndex({ name: "docs", dimension: 3, metric: "COSINE" });
	* await index.add("doc-1", [0.1, 0.2, 0.3]);
	* const hits = await index.query({ vector: [0.1, 0.2, 0.3], topK: 5 });
	* ```
	*/
	get vector() {
		return {
			/**
			* Creates a vector index and returns a handle to it.
			*/
			createIndex: (params) => {
				return createVectorIndex(this.client, params, this.opts);
			},
			/**
			* Returns a handle to an existing vector index without sending any command.
			*/
			index: (name) => {
				return initVectorIndex(this.client, name, this.opts);
			}
		};
	}
	/**
	* Create a new pipeline that allows you to send requests in bulk.
	*
	* @see {@link Pipeline}
	*/
	pipeline = () => new Pipeline({
		client: this.client,
		commandOptions: this.opts,
		multiExec: false
	});
	autoPipeline = () => {
		return createAutoPipelineProxy(this);
	};
	/**
	* Create a new transaction to allow executing multiple steps atomically.
	*
	* All the commands in a transaction are serialized and executed sequentially. A request sent by
	* another client will never be served in the middle of the execution of a Redis Transaction. This
	* guarantees that the commands are executed as a single isolated operation.
	*
	* @see {@link Pipeline}
	*/
	multi = () => new Pipeline({
		client: this.client,
		commandOptions: this.opts,
		multiExec: true
	});
	/**
	* Returns an instance that can be used to execute `BITFIELD` commands on one key.
	*
	* @example
	* ```typescript
	* redis.set("mykey", 0);
	* const result = await redis.bitfield("mykey")
	*   .set("u4", 0, 16)
	*   .incr("u4", "#1", 1)
	*   .exec();
	* console.log(result); // [0, 1]
	* ```
	*
	* @see https://redis.io/commands/bitfield
	*/
	bitfield = (...args) => new BitFieldCommand(args, this.client, this.opts);
	/**
	* @see https://redis.io/commands/append
	*/
	append = (...args) => new AppendCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arcount
	*/
	arcount = (...args) => new ArCountCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/ardel
	*/
	ardel = (...args) => new ArDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/ardelrange
	*/
	ardelrange = (...args) => new ArDelRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arget
	*/
	arget = (...args) => new ArGetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/argetrange
	*/
	argetrange = (...args) => new ArGetRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/argrep
	*/
	argrep = (key, start, end, opts) => new ArGrepCommand([
		key,
		start,
		end,
		opts
	], this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arinfo
	*/
	arinfo = (...args) => new ArInfoCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arinsert
	*/
	arinsert = (key, ...values) => new ArInsertCommand([key, ...values], this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arlastitems
	*/
	arlastitems = (...args) => new ArLastItemsCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arlen
	*/
	arlen = (...args) => new ArLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/armget
	*/
	armget = (...args) => new ArMGetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/armset
	*/
	armset = (key, values) => new ArMSetCommand([key, values], this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arnext
	*/
	arnext = (...args) => new ArNextCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arop
	*/
	arop = (key, start, end, operation) => new ArOpCommand([
		key,
		start,
		end,
		operation
	], this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arring
	*/
	arring = (key, size, ...values) => new ArRingCommand([
		key,
		size,
		...values
	], this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arscan
	*/
	arscan = (...args) => new ArScanCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arseek
	*/
	arseek = (...args) => new ArSeekCommand(args, this.opts).exec(this.client);
	/**
	* @see https://upstash.com/docs/redis/commands/array/arset
	*/
	arset = (key, index, ...values) => new ArSetCommand([
		key,
		index,
		...values
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/bitcount
	*/
	bitcount = (...args) => new BitCountCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/bitop
	*/
	bitop = (op, destinationKey, sourceKey, ...sourceKeys) => new BitOpCommand([
		op,
		destinationKey,
		sourceKey,
		...sourceKeys
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/bitpos
	*/
	bitpos = (...args) => new BitPosCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/client-setinfo
	*/
	clientSetinfo = (...args) => new ClientSetInfoCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/copy
	*/
	copy = (...args) => new CopyCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/dbsize
	*/
	dbsize = () => new DBSizeCommand(this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/decr
	*/
	decr = (...args) => new DecrCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/decrby
	*/
	decrby = (...args) => new DecrByCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/del
	*/
	del = (...args) => new DelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/echo
	*/
	echo = (...args) => new EchoCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/eval_ro
	*/
	evalRo = (...args) => new EvalROCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/eval
	*/
	eval = (...args) => new EvalCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/evalsha_ro
	*/
	evalshaRo = (...args) => new EvalshaROCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/evalsha
	*/
	evalsha = (...args) => new EvalshaCommand(args, this.opts).exec(this.client);
	/**
	* Generic method to execute any Redis command.
	*/
	exec = (args) => new ExecCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/exists
	*/
	exists = (...args) => new ExistsCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/expire
	*/
	expire = (...args) => new ExpireCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/expireat
	*/
	expireat = (...args) => new ExpireAtCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/flushall
	*/
	flushall = (args) => new FlushAllCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/flushdb
	*/
	flushdb = (...args) => new FlushDBCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geoadd
	*/
	geoadd = (...args) => new GeoAddCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geopos
	*/
	geopos = (...args) => new GeoPosCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geodist
	*/
	geodist = (...args) => new GeoDistCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geohash
	*/
	geohash = (...args) => new GeoHashCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geosearch
	*/
	geosearch = (...args) => new GeoSearchCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/geosearchstore
	*/
	geosearchstore = (...args) => new GeoSearchStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/get
	*/
	get = (...args) => new GetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/getbit
	*/
	getbit = (...args) => new GetBitCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/getdel
	*/
	getdel = (...args) => new GetDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/getex
	*/
	getex = (...args) => new GetExCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/getrange
	*/
	getrange = (...args) => new GetRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/getset
	*/
	getset = (key, value) => new GetSetCommand([key, value], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hdel
	*/
	hdel = (...args) => new HDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hexists
	*/
	hexists = (...args) => new HExistsCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hexpire
	*/
	hexpire = (...args) => new HExpireCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hexpireat
	*/
	hexpireat = (...args) => new HExpireAtCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hexpiretime
	*/
	hexpiretime = (...args) => new HExpireTimeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/httl
	*/
	httl = (...args) => new HTtlCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hpexpire
	*/
	hpexpire = (...args) => new HPExpireCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hpexpireat
	*/
	hpexpireat = (...args) => new HPExpireAtCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hpexpiretime
	*/
	hpexpiretime = (...args) => new HPExpireTimeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hpttl
	*/
	hpttl = (...args) => new HPTtlCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hpersist
	*/
	hpersist = (...args) => new HPersistCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hget
	*/
	hget = (...args) => new HGetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hgetall
	*/
	hgetall = (...args) => new HGetAllCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hgetdel
	*/
	hgetdel = (...args) => new HGetDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hgetex
	*/
	hgetex = (...args) => new HGetExCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hincrby
	*/
	hincrby = (...args) => new HIncrByCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hincrbyfloat
	*/
	hincrbyfloat = (...args) => new HIncrByFloatCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hkeys
	*/
	hkeys = (...args) => new HKeysCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hlen
	*/
	hlen = (...args) => new HLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hmget
	*/
	hmget = (...args) => new HMGetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hmset
	*/
	hmset = (key, kv) => new HMSetCommand([key, kv], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hrandfield
	*/
	hrandfield = (key, count, withValues) => new HRandFieldCommand([
		key,
		count,
		withValues
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hscan
	*/
	hscan = (...args) => new HScanCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hset
	*/
	hset = (key, kv) => new HSetCommand([key, kv], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hsetex
	*/
	hsetex = (...args) => new HSetExCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hsetnx
	*/
	hsetnx = (key, field, value) => new HSetNXCommand([
		key,
		field,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hstrlen
	*/
	hstrlen = (...args) => new HStrLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/hvals
	*/
	hvals = (...args) => new HValsCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/incr
	*/
	incr = (...args) => new IncrCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/incrby
	*/
	incrby = (...args) => new IncrByCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/incrbyfloat
	*/
	incrbyfloat = (...args) => new IncrByFloatCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/keys
	*/
	keys = (...args) => new KeysCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lindex
	*/
	lindex = (...args) => new LIndexCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/linsert
	*/
	linsert = (key, direction, pivot, value) => new LInsertCommand([
		key,
		direction,
		pivot,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/llen
	*/
	llen = (...args) => new LLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lmove
	*/
	lmove = (...args) => new LMoveCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lpop
	*/
	lpop = (...args) => new LPopCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lmpop
	*/
	lmpop = (...args) => new LmPopCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lpos
	*/
	lpos = (...args) => new LPosCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lpush
	*/
	lpush = (key, ...elements) => new LPushCommand([key, ...elements], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lpushx
	*/
	lpushx = (key, ...elements) => new LPushXCommand([key, ...elements], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lrange
	*/
	lrange = (...args) => new LRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lrem
	*/
	lrem = (key, count, value) => new LRemCommand([
		key,
		count,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/lset
	*/
	lset = (key, index, value) => new LSetCommand([
		key,
		index,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/ltrim
	*/
	ltrim = (...args) => new LTrimCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/mget
	*/
	mget = (...args) => new MGetCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/mset
	*/
	mset = (kv) => new MSetCommand([kv], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/msetnx
	*/
	msetnx = (kv) => new MSetNXCommand([kv], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/persist
	*/
	persist = (...args) => new PersistCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/pexpire
	*/
	pexpire = (...args) => new PExpireCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/pexpireat
	*/
	pexpireat = (...args) => new PExpireAtCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/pfadd
	*/
	pfadd = (...args) => new PfAddCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/pfcount
	*/
	pfcount = (...args) => new PfCountCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/pfmerge
	*/
	pfmerge = (...args) => new PfMergeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/ping
	*/
	ping = (args) => new PingCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/psetex
	*/
	psetex = (key, ttl, value) => new PSetEXCommand([
		key,
		ttl,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/psubscribe
	*/
	psubscribe = (patterns) => {
		const patternArray = Array.isArray(patterns) ? patterns : [patterns];
		return new Subscriber(this.client, patternArray, true, this.opts);
	};
	/**
	* @see https://redis.io/commands/pttl
	*/
	pttl = (...args) => new PTtlCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/publish
	*/
	publish = (...args) => new PublishCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/randomkey
	*/
	randomkey = () => new RandomKeyCommand().exec(this.client);
	/**
	* @see https://redis.io/commands/rename
	*/
	rename = (...args) => new RenameCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/renamenx
	*/
	renamenx = (...args) => new RenameNXCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/rpop
	*/
	rpop = (...args) => new RPopCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/rpush
	*/
	rpush = (key, ...elements) => new RPushCommand([key, ...elements], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/rpushx
	*/
	rpushx = (key, ...elements) => new RPushXCommand([key, ...elements], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sadd
	*/
	sadd = (key, member, ...members) => new SAddCommand([
		key,
		member,
		...members
	], this.opts).exec(this.client);
	scan(cursor, opts) {
		return new ScanCommand([cursor, opts], this.opts).exec(this.client);
	}
	/**
	* @see https://redis.io/commands/scard
	*/
	scard = (...args) => new SCardCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/script-exists
	*/
	scriptExists = (...args) => new ScriptExistsCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/script-flush
	*/
	scriptFlush = (...args) => new ScriptFlushCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/script-load
	*/
	scriptLoad = (...args) => new ScriptLoadCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sdiff
	*/
	sdiff = (...args) => new SDiffCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sdiffstore
	*/
	sdiffstore = (...args) => new SDiffStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/set
	*/
	set = (key, value, opts) => new SetCommand([
		key,
		value,
		opts
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/setbit
	*/
	setbit = (...args) => new SetBitCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/setex
	*/
	setex = (key, ttl, value) => new SetExCommand([
		key,
		ttl,
		value
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/setnx
	*/
	setnx = (key, value) => new SetNxCommand([key, value], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/setrange
	*/
	setrange = (...args) => new SetRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sinter
	*/
	sinter = (...args) => new SInterCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sintercard
	*/
	sintercard = (...args) => new SInterCardCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sinterstore
	*/
	sinterstore = (...args) => new SInterStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sismember
	*/
	sismember = (key, member) => new SIsMemberCommand([key, member], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/smismember
	*/
	smismember = (key, members) => new SMIsMemberCommand([key, members], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/smembers
	*/
	smembers = (...args) => new SMembersCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/smove
	*/
	smove = (source, destination, member) => new SMoveCommand([
		source,
		destination,
		member
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/spop
	*/
	spop = (...args) => new SPopCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/srandmember
	*/
	srandmember = (...args) => new SRandMemberCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/srem
	*/
	srem = (key, ...members) => new SRemCommand([key, ...members], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sscan
	*/
	sscan = (...args) => new SScanCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/strlen
	*/
	strlen = (...args) => new StrLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/subscribe
	*/
	subscribe = (channels) => {
		const channelArray = Array.isArray(channels) ? channels : [channels];
		return new Subscriber(this.client, channelArray, false, this.opts);
	};
	/**
	* @see https://redis.io/commands/sunion
	*/
	sunion = (...args) => new SUnionCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/sunionstore
	*/
	sunionstore = (...args) => new SUnionStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/time
	*/
	time = () => new TimeCommand().exec(this.client);
	/**
	* @see https://redis.io/commands/touch
	*/
	touch = (...args) => new TouchCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/ttl
	*/
	ttl = (...args) => new TtlCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/type
	*/
	type = (...args) => new TypeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/unlink
	*/
	unlink = (...args) => new UnlinkCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xadd
	*/
	xadd = (...args) => new XAddCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xack
	*/
	xack = (...args) => new XAckCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xackdel
	*/
	xackdel = (...args) => new XAckDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xdel
	*/
	xdel = (...args) => new XDelCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xdelex
	*/
	xdelex = (...args) => new XDelExCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xgroup
	*/
	xgroup = (...args) => new XGroupCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xread
	*/
	xread = (...args) => new XReadCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xreadgroup
	*/
	xreadgroup = (...args) => new XReadGroupCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xinfo
	*/
	xinfo = (...args) => new XInfoCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xlen
	*/
	xlen = (...args) => new XLenCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xpending
	*/
	xpending = (...args) => new XPendingCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xclaim
	*/
	xclaim = (...args) => new XClaimCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xautoclaim
	*/
	xautoclaim = (...args) => new XAutoClaim(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xtrim
	*/
	xtrim = (...args) => new XTrimCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xrange
	*/
	xrange = (...args) => new XRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/xrevrange
	*/
	xrevrange = (...args) => new XRevRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zadd
	*/
	zadd = (...args) => {
		if ("score" in args[1]) return new ZAddCommand([
			args[0],
			args[1],
			...args.slice(2)
		], this.opts).exec(this.client);
		return new ZAddCommand([
			args[0],
			args[1],
			...args.slice(2)
		], this.opts).exec(this.client);
	};
	/**
	* @see https://redis.io/commands/zcard
	*/
	zcard = (...args) => new ZCardCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zcount
	*/
	zcount = (...args) => new ZCountCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zdiffstore
	*/
	zdiffstore = (...args) => new ZDiffStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zincrby
	*/
	zincrby = (key, increment, member) => new ZIncrByCommand([
		key,
		increment,
		member
	], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zinterstore
	*/
	zinterstore = (...args) => new ZInterStoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zlexcount
	*/
	zlexcount = (...args) => new ZLexCountCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zmscore
	*/
	zmscore = (...args) => new ZMScoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zpopmax
	*/
	zpopmax = (...args) => new ZPopMaxCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zpopmin
	*/
	zpopmin = (...args) => new ZPopMinCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zrange
	*/
	zrange = (...args) => new ZRangeCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zrank
	*/
	zrank = (key, member) => new ZRankCommand([key, member], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zrem
	*/
	zrem = (key, ...members) => new ZRemCommand([key, ...members], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zremrangebylex
	*/
	zremrangebylex = (...args) => new ZRemRangeByLexCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zremrangebyrank
	*/
	zremrangebyrank = (...args) => new ZRemRangeByRankCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zremrangebyscore
	*/
	zremrangebyscore = (...args) => new ZRemRangeByScoreCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zrevrank
	*/
	zrevrank = (key, member) => new ZRevRankCommand([key, member], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zscan
	*/
	zscan = (...args) => new ZScanCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zscore
	*/
	zscore = (key, member) => new ZScoreCommand([key, member], this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zunion
	*/
	zunion = (...args) => new ZUnionCommand(args, this.opts).exec(this.client);
	/**
	* @see https://redis.io/commands/zunionstore
	*/
	zunionstore = (...args) => new ZUnionStoreCommand(args, this.opts).exec(this.client);
};
var VERSION = "v1.39.0";
//#endregion
//#region node_modules/@upstash/redis/nodejs.mjs
if (typeof atob === "undefined") global.atob = (b64) => Buffer.from(b64, "base64").toString("utf8");
var Redis2 = class _Redis extends Redis {
	/**
	* Create a new redis client by providing a custom `Requester` implementation
	*
	* @example
	* ```ts
	*
	* import { UpstashRequest, Requester, UpstashResponse, Redis } from "@upstash/redis"
	*
	*  const requester: Requester = {
	*    request: <TResult>(req: UpstashRequest): Promise<UpstashResponse<TResult>> => {
	*      // ...
	*    }
	*  }
	*
	* const redis = new Redis(requester)
	* ```
	*/
	constructor(configOrRequester) {
		if ("request" in configOrRequester) {
			super(configOrRequester);
			return;
		}
		if (!configOrRequester.url) console.warn(`[Upstash Redis] The 'url' property is missing or undefined in your Redis config. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis`);
		else if (configOrRequester.url.startsWith(" ") || configOrRequester.url.endsWith(" ") || /\r|\n/.test(configOrRequester.url)) console.warn("[Upstash Redis] The redis url contains whitespace or newline, which can cause errors!");
		if (!configOrRequester.token) console.warn(`[Upstash Redis] The 'token' property is missing or undefined in your Redis config. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis`);
		else if (configOrRequester.token.startsWith(" ") || configOrRequester.token.endsWith(" ") || /\r|\n/.test(configOrRequester.token)) console.warn("[Upstash Redis] The redis token contains whitespace or newline, which can cause errors!");
		const client = new HttpClient({
			baseUrl: configOrRequester.url,
			retry: configOrRequester.retry,
			headers: { authorization: `Bearer ${configOrRequester.token}` },
			agent: configOrRequester.agent,
			responseEncoding: configOrRequester.responseEncoding,
			cache: configOrRequester.cache ?? "no-store",
			signal: configOrRequester.signal,
			keepAlive: configOrRequester.keepAlive,
			readYourWrites: configOrRequester.readYourWrites
		});
		const safeEnv = typeof process === "object" && process && typeof process.env === "object" && process.env ? process.env : {};
		super(client, {
			automaticDeserialization: configOrRequester.automaticDeserialization,
			enableTelemetry: configOrRequester.enableTelemetry ?? !safeEnv.UPSTASH_DISABLE_TELEMETRY,
			latencyLogging: configOrRequester.latencyLogging,
			enableAutoPipelining: configOrRequester.enableAutoPipelining
		});
		const nodeVersion = typeof process === "object" && process ? process.version : void 0;
		this.addTelemetry({
			runtime: typeof EdgeRuntime === "string" ? "edge-light" : nodeVersion ? `node@${nodeVersion}` : "unknown",
			platform: safeEnv.UPSTASH_CONSOLE ? "console" : safeEnv.VERCEL ? "vercel" : safeEnv.AWS_REGION ? "aws" : "unknown",
			sdk: `@upstash/redis@${VERSION}`
		});
		if (this.enableAutoPipelining) return this.autoPipeline();
	}
	/**
	* Create a new Upstash Redis instance from environment variables.
	*
	* Use this to automatically load connection secrets from your environment
	* variables. For instance when using the Vercel integration.
	*
	* This tries to load connection details from your environment using `process.env`:
	* - URL: `UPSTASH_REDIS_REST_URL` or fallback to `KV_REST_API_URL`
	* - Token: `UPSTASH_REDIS_REST_TOKEN` or fallback to `KV_REST_API_TOKEN`
	*
	* The fallback variables provide compatibility with Vercel KV and other platforms
	* that may use different naming conventions.
	*/
	static fromEnv(config) {
		if (typeof process !== "object" || !process || typeof process.env !== "object" || !process.env) throw new TypeError("[Upstash Redis] Unable to get environment variables, `process.env` is undefined. If you are deploying to cloudflare, please import from \"@upstash/redis/cloudflare\" instead");
		const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
		if (!url) console.warn("[Upstash Redis] Unable to find environment variable: `UPSTASH_REDIS_REST_URL`. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis");
		const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
		if (!token) console.warn("[Upstash Redis] Unable to find environment variable: `UPSTASH_REDIS_REST_TOKEN`. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis");
		return new _Redis({
			...config,
			url,
			token
		});
	}
};
//#endregion
//#region src/vfx/giphy.ts
/**
* GIFs on Giphy, which is where the memes effect gets its pictures.
*
* Nothing is copied into this repository. The files stay on Giphy and are
* played from there, and an animation stores only ids. That is the safety
* rule as much as the licensing one: whatever link someone pastes, only the id
* survives, and the only address ever asked for is built here from it — so a
* shared animation cannot point everyone's phone at some other site.
*/
var ID = /^[A-Za-z0-9]{6,40}$/;
/**
* The id in a Giphy link, or in a bare id; null for anything else.
*
* Giphy links come in several shapes, and people paste whichever they have:
*   giphy.com/gifs/some-words-ID          (the page, from the address bar)
*   giphy.com/embed/ID                    (the embed code)
*   media.giphy.com/media/ID/giphy.gif    (the file, from "Copy link")
*   media2.giphy.com/media/v1.xxx/ID/giphy.gif
*   i.giphy.com/ID.gif
* Short gph.is links would need a request to resolve, so they are refused.
*/
function giphyId(input) {
	const text = input.trim();
	if (ID.test(text)) return text;
	let url;
	try {
		url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();
	if (host !== "giphy.com" && !host.endsWith(".giphy.com")) return null;
	const parts = url.pathname.split("/").filter(Boolean);
	const media = parts.indexOf("media");
	let candidate;
	if (media !== -1) candidate = parts[media + 1]?.startsWith("v1.") ? parts[media + 2] : parts[media + 1];
	else if (parts[0] === "gifs" || parts[0] === "stickers") candidate = parts[1]?.split("-").pop();
	else if (parts[0] === "embed") candidate = parts[1];
	else if (host === "i.giphy.com" && parts.length === 1) candidate = parts[0].replace(/\.(gif|webp|mp4)$/i, "");
	return candidate && ID.test(candidate) ? candidate : null;
}
/**
* Well-known memes, picked by hand and each checked by eye. The memes effect
* starts with this list, and בארי אזומה uses it. Left out on purpose: green
* screen versions, which show a green box, and anything much over half a
* megabyte, which would arrive late on phone data.
*/
var MEME_GIFS = [
	"NTur7XlVDUdqM",
	"6nWhy3ulBL7GSCvKw6",
	"sU511xfb7ORqw",
	"WRuBiZKB6xgsS9DrFA",
	"QBd2kLB5qDmysEXre9",
	"BQUITFiYVtNte",
	"DfLwM9kttDFEQ",
	"lgcUUCXgC8mEo",
	"sIIhZliB2McAo",
	"Q81NcsY6YxK7jxnr4v",
	"26FPzgftlRfgwkEw0",
	"14b13BDH3V81wc",
	"XIqCQx02E1U9W",
	"l4Jz3a8jO92crUlWM",
	"BmmfETghGOPrW",
	"lzYEj4dw7rcJJCsvjo",
	"b9aScKLxdv0Y0",
	"xTiTnoORMNaANLYrHW",
	"we4Hp4J3n7riw",
	"COYGe9rZvfiaQ",
	"dkBXo121oUIE",
	"fXJyMfUdqVCMPAnPJM",
	"JYZ397GsFrFtu",
	"OK27wINdQS5YQ",
	"xL7PDV9frcudO",
	"COYggJB0KnADm",
	"5DCLZUqb0ImZy",
	"l44Q6HJ7lkiweTQ6k",
	"cxnvN8s3FVNII",
	"xUOxeZn47mrdabqDNC",
	"4g6xgP7FXjy12",
	"oW4csEbiMzVjq",
	"RIq4eoF2iw3eZeJMtv",
	"11qCjC856PSmnm",
	"V1dH38rUl9yX7xU8nh"
];
//#endregion
//#region src/vfx/params.ts
var HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
var HEX_WITH_ALPHA = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function clamp(n, min, max) {
	return Math.min(max, Math.max(min, n));
}
/**
* A fresh copy of a default. The schema's arrays are shared, and a form that
* edited one in place would quietly change the default for everyone after.
*/
function copy(value) {
	if (!Array.isArray(value)) return value;
	return value.map((item) => typeof item === "object" && item !== null ? { ...item } : item);
}
/** A finite number, or undefined. Numeric strings count — form fields produce them. */
function toFinite(value) {
	const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? n : void 0;
}
function sanitizeNumber(spec, value) {
	const n = toFinite(value);
	if (n === void 0) return spec.default;
	return clamp(spec.integer ? Math.round(n) : n, spec.min, spec.max);
}
function sanitizeColor(spec, value) {
	if (typeof value !== "string") return spec.default;
	const trimmed = value.trim();
	return (spec.alpha ? HEX_WITH_ALPHA : HEX).test(trimmed) ? trimmed.toLowerCase() : spec.default;
}
function sanitizeSelect(spec, value) {
	return spec.options.some((option) => option.value === value) ? value : spec.default;
}
function sanitizeBoolean(spec, value) {
	return typeof value === "boolean" ? value : spec.default;
}
/**
* Control characters become spaces, and the cut is made on whole characters
* rather than UTF-16 units, so it never leaves half an emoji behind.
*
* Filtered by code point instead of with a regex over the control range, which
* eslint rightly refuses to let through.
*/
function cleanText(value, maxLength) {
	const cleaned = Array.from(value).map((ch) => {
		const code = ch.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : ch;
	}).join("").replace(/ {2,}/g, " ").trim();
	return Array.from(cleaned).slice(0, maxLength).join("").trim();
}
function sanitizeText(spec, value) {
	if (typeof value !== "string") return spec.default;
	return cleanText(value, spec.maxLength) || spec.default;
}
function sanitizePoint(spec, value) {
	if (!Array.isArray(value) || value.length !== 2) return copy(spec.default);
	const x = toFinite(value[0]);
	const y = toFinite(value[1]);
	if (x === void 0 || y === void 0) return copy(spec.default);
	return [clamp(x, 0, 1), clamp(y, 0, 1)];
}
function sanitizeTriple(value, min, max) {
	if (!Array.isArray(value) || value.length !== 3) return void 0;
	const parts = value.map(toFinite);
	if (parts.some((part) => part === void 0)) return void 0;
	return parts.map((part) => clamp(part, min, max));
}
function sanitizeScale(spec, value) {
	const n = toFinite(value);
	if (n !== void 0) return clamp(n, spec.min, spec.max);
	return sanitizeTriple(value, spec.min, spec.max) ?? copy(spec.default);
}
function sanitizeVec3(spec, value) {
	return sanitizeTriple(value, spec.min, spec.max) ?? copy(spec.default);
}
/** Bad entries are dropped rather than failing the whole list. */
function sanitizeColorList(spec, value) {
	if (!Array.isArray(value)) return copy(spec.default);
	const colors = value.filter((c) => typeof c === "string" && HEX.test(c.trim())).map((c) => c.trim().toLowerCase()).slice(0, spec.maxItems);
	return colors.length > 0 ? colors : copy(spec.default);
}
/** Blank entries are dropped, as words left empty in the builder are. */
function sanitizeTextList(spec, value) {
	if (!Array.isArray(value)) return copy(spec.default);
	const items = value.filter((item) => typeof item === "string").map((item) => cleanText(item, spec.maxLength)).filter((item) => item !== "").slice(0, spec.maxItems);
	return items.length > 0 ? items : copy(spec.default);
}
/** Links become ids; duplicates and anything unrecognised are dropped. */
function sanitizeGiphyList(spec, value) {
	if (!Array.isArray(value)) return copy(spec.default);
	const ids = [];
	for (const item of value) {
		if (ids.length >= spec.maxItems) break;
		const id = typeof item === "string" ? giphyId(item) : null;
		if (id && !ids.includes(id)) ids.push(id);
	}
	return ids.length > 0 ? ids : copy(spec.default);
}
/**
* A hand without a usable rate or length is dropped, since neither has a
* sensible stand-in. A missing width does, so that one falls back.
*/
function sanitizeHands(spec, value) {
	if (!Array.isArray(value)) return copy(spec.default);
	const { bounds } = spec;
	const hands = [];
	for (const item of value) {
		if (hands.length >= spec.maxItems) break;
		if (typeof item !== "object" || item === null) continue;
		const hand = item;
		const rate = toFinite(hand.rate);
		const length = toFinite(hand.length);
		if (rate === void 0 || length === void 0) continue;
		hands.push({
			rate: clamp(rate, bounds.rate.min, bounds.rate.max),
			length: clamp(length, bounds.length.min, bounds.length.max),
			width: clamp(toFinite(hand.width) ?? spec.defaultWidth, bounds.width.min, bounds.width.max)
		});
	}
	return hands.length > 0 ? hands : copy(spec.default);
}
/** Make one value safe for the spec it belongs to. Never throws. */
function sanitizeValue(spec, value) {
	switch (spec.kind) {
		case "number": return sanitizeNumber(spec, value);
		case "color": return sanitizeColor(spec, value);
		case "select": return sanitizeSelect(spec, value);
		case "boolean": return sanitizeBoolean(spec, value);
		case "text": return sanitizeText(spec, value);
		case "point": return sanitizePoint(spec, value);
		case "scale": return sanitizeScale(spec, value);
		case "vec3": return sanitizeVec3(spec, value);
		case "colorList": return sanitizeColorList(spec, value);
		case "textList": return sanitizeTextList(spec, value);
		case "giphyList": return sanitizeGiphyList(spec, value);
		case "handList": return sanitizeHands(spec, value);
	}
}
//#endregion
//#region src/vfx/schema.ts
/**
* Shared by every effect. The defaults are the ones EffectCanvas assumes too.
* An animation's shared timing uses the same fields — see animations/timing.ts.
*/
var TIMING_SCHEMA = {
	fadeInDuration: {
		kind: "number",
		label: "Fade in",
		guide: "How long it takes to appear, in seconds. Below about 0.3 it pops in rather than fading.",
		default: 1,
		min: 0,
		max: 10,
		step: .1,
		unit: "s"
	},
	duration: {
		kind: "number",
		label: "Hold",
		guide: "How long it stays at full strength, in seconds. This is not the total — the fade in and fade out are added on top.",
		default: 3,
		min: 0,
		max: 15,
		step: .1,
		unit: "s"
	},
	fadeDuration: {
		kind: "number",
		label: "Fade out",
		guide: "How long it takes to disappear, in seconds.",
		default: 2,
		min: 0,
		max: 10,
		step: .1,
		unit: "s"
	}
};
var BLEND_OPTIONS = [{
	value: "add",
	label: "Add light"
}, {
	value: "normal",
	label: "Paint over"
}];
/**
* The black hole and the clock place themselves the same way. The second
* number runs from the bottom up: three.js gives a plane's top edge v = 1.
*/
var CENTER = {
	kind: "point",
	label: "Position",
	guide: "Where it sits. 0.5, 0.5 is the middle of the screen. The first number goes from the left edge (0) to the right (1); the second from the bottom (0) to the top (1) — so a smaller second number moves it down.",
	default: [.5, .5]
};
/** Declared in the order the effects panel lists them. */
var EFFECT_SCHEMAS = {
	edgeGlow: {
		label: "Edge light",
		description: "Light, or darkness, coming in from one edge of the screen.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The colour at the edge. For darkness closing in, use black with Blend set to Paint over.",
				default: "#ffffff"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "How strong it is right at the edge, from 0 (nothing) to 1 (full colour).",
				default: .6,
				min: 0,
				max: 1,
				step: .05
			},
			edge: {
				kind: "select",
				label: "Edge",
				guide: "Which side of the screen it comes from.",
				default: "bottom",
				options: [
					{
						value: "top",
						label: "Top"
					},
					{
						value: "bottom",
						label: "Bottom"
					},
					{
						value: "left",
						label: "Left"
					},
					{
						value: "right",
						label: "Right"
					}
				]
			},
			spread: {
				kind: "number",
				label: "Reach",
				guide: "How far across the screen it reaches before fading out. 0.5 is halfway; 1 crosses the whole screen.",
				default: .45,
				min: .01,
				max: 1,
				step: .01
			},
			blend: {
				kind: "select",
				label: "Blend",
				guide: "Add light brightens the screen, which is what makes it glow — but adding black changes nothing, so dark colours are invisible. Paint over lays the colour on top instead, and is the only way to make an edge go dark.",
				default: "add",
				options: BLEND_OPTIONS
			},
			...TIMING_SCHEMA
		}
	},
	glow: {
		label: "Screen flash",
		description: "A wash of colour over the whole screen. Short and strong reads as a flash.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The colour the whole screen is tinted. It adds light, so dark colours barely show.",
				default: "#ff2200"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (the screen turns this colour).",
				default: .5,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	sparkles: {
		label: "Particles",
		description: "Glowing points that drift in place, or stream in one direction.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The particles' colour. With Blend on Add light, black is invisible — switch to Paint over for dark particles.",
				default: "#ffffff"
			},
			count: {
				kind: "number",
				label: "Amount",
				guide: "How many particles. A few hundred is plenty; very large numbers slow phones down.",
				default: 100,
				min: 1,
				max: 2e3,
				step: 5,
				integer: true
			},
			scale: {
				kind: "scale",
				label: "Spread area",
				guide: "How far out they are scattered. One number spreads them evenly; three set width, height and depth separately.",
				default: 10,
				min: .1,
				max: 30
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How big each particle is. They grow as they drift towards you, so a large size wants a Size limit.",
				default: 2,
				min: .1,
				max: 10,
				step: .1
			},
			speed: {
				kind: "number",
				label: "Speed",
				guide: "How fast they move. With Direction on Drift, it is how quickly they wander.",
				default: 1,
				min: 0,
				max: 20,
				step: .1
			},
			direction: {
				kind: "select",
				label: "Direction",
				guide: "Which way they travel. Drift keeps them floating in place.",
				default: "random",
				options: [
					{
						value: "random",
						label: "Drift"
					},
					{
						value: "up",
						label: "Up"
					},
					{
						value: "down",
						label: "Down"
					},
					{
						value: "left",
						label: "Left"
					},
					{
						value: "right",
						label: "Right"
					}
				]
			},
			gravity: {
				kind: "number",
				label: "Gravity",
				guide: "Pulls moving particles down over time. 0 for none; negative makes them rise.",
				default: 0,
				min: -10,
				max: 10,
				step: .1
			},
			noise: {
				kind: "number",
				label: "Wobble",
				guide: "Side-to-side turbulence on moving particles. 0 keeps their paths straight.",
				default: 0,
				min: 0,
				max: 5,
				step: .1
			},
			blend: {
				kind: "select",
				label: "Blend",
				guide: "Add light makes particles glow, but cannot draw anything darker than the screen. Paint over draws them as solid colour — the only way to get black particles.",
				default: "add",
				options: BLEND_OPTIONS
			},
			maxPixelSize: {
				kind: "number",
				label: "Size limit",
				guide: "The largest a particle can look, in pixels. They grow as they come closer, so without a limit a dark particle can become a disc that covers everything.",
				default: 4096,
				min: 4,
				max: 4096,
				step: 4,
				integer: true,
				unit: "px"
			},
			...TIMING_SCHEMA
		}
	},
	fireworks: {
		label: "Fireworks",
		description: "Shells that rise, burst, and rain sparks.",
		params: {
			colors: {
				kind: "colorList",
				label: "Colours",
				guide: "Up to four. Each shell takes the next one in turn.",
				default: [
					"#ffd76b",
					"#ff5f6d",
					"#6bc9ff",
					"#8dff6b"
				],
				maxItems: 4
			},
			bursts: {
				kind: "number",
				label: "Shells",
				guide: "How many fireworks go up in total.",
				default: 14,
				min: 1,
				max: 40,
				step: 1,
				integer: true
			},
			sparksPerBurst: {
				kind: "number",
				label: "Sparks per shell",
				guide: "How full each burst is. Lots of shells with lots of sparks can white out the screen and hide the winner's name.",
				default: 55,
				min: 5,
				max: 150,
				step: 5,
				integer: true
			},
			spread: {
				kind: "number",
				label: "Burst size",
				guide: "How far each shell throws its sparks.",
				default: 1.6,
				min: .1,
				max: 5,
				step: .1
			},
			gravity: {
				kind: "number",
				label: "Gravity",
				guide: "How hard the sparks are pulled back down. 0 lets them hang in the air.",
				default: 1.5,
				min: -2,
				max: 6,
				step: .1
			},
			size: {
				kind: "number",
				label: "Spark size",
				guide: "How big each spark is.",
				default: 1.2,
				min: .2,
				max: 5,
				step: .1
			},
			interval: {
				kind: "number",
				label: "Time between shells",
				guide: "Seconds between one firework and the next. Smaller packs more into the same time.",
				default: .28,
				min: .05,
				max: 3,
				step: .01,
				unit: "s"
			},
			riseTime: {
				kind: "number",
				label: "Climb",
				guide: "Seconds a shell spends rising before it bursts.",
				default: .55,
				min: .05,
				max: 3,
				step: .05,
				unit: "s"
			},
			life: {
				kind: "number",
				label: "Burn time",
				guide: "Seconds each spark keeps glowing after the burst.",
				default: 1.7,
				min: .2,
				max: 6,
				step: .1,
				unit: "s"
			},
			maxPixelSize: {
				kind: "number",
				label: "Size limit",
				guide: "The largest a spark can look, in pixels. Stops sparks turning into blobs as they drift closer.",
				default: 42,
				min: 4,
				max: 256,
				step: 2,
				integer: true,
				unit: "px"
			},
			...TIMING_SCHEMA
		}
	},
	blackHole: {
		label: "Black hole",
		description: "A black core with a glowing ring, and strands of light being pulled in.",
		params: {
			color: {
				kind: "color",
				label: "Ring colour",
				guide: "The colour of the glowing ring around the outside.",
				default: "#454b55"
			},
			coreColor: {
				kind: "color",
				label: "Centre colour",
				guide: "The colour of the middle. Black is what a black hole looks like; any other colour is painted over the middle instead, so a deep red or purple reads as something else entirely.",
				default: "#000000"
			},
			radius: {
				kind: "number",
				label: "Size",
				guide: "How big the black centre is. Around 0.15 to 0.2 looks right; much larger covers the winner's name.",
				default: .16,
				min: .02,
				max: .5,
				step: .01
			},
			spin: {
				kind: "number",
				label: "Spin",
				guide: "How fast the light swirls around it. Negative spins the other way.",
				default: 1,
				min: -5,
				max: 5,
				step: .1
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "At 1 the centre is solid black; lower lets the screen show faintly through.",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			strands: {
				kind: "number",
				label: "Strands",
				guide: "How many streaks of light wrap around it. 1 is sparse; past about 4 they blur into a sheet.",
				default: 1,
				min: .2,
				max: 6,
				step: .1
			},
			windUp: {
				kind: "number",
				label: "Wind-up",
				guide: "How swirled the strands already are when it appears. Near 0 they start as specks and never have time to stretch; around 18 gives long curved streaks straight away.",
				default: 18,
				min: 0,
				max: 60,
				step: 1
			},
			center: CENTER,
			...TIMING_SCHEMA
		}
	},
	sun: {
		label: "Sun",
		description: "A burning disc with rays reaching out of it.",
		params: {
			color: {
				kind: "color",
				label: "Disc colour",
				guide: "The colour of the sun itself. The middle is drawn hotter than this and the rim cooler, the way a real one looks.",
				default: "#ffd166"
			},
			rayColor: {
				kind: "color",
				label: "Ray colour",
				guide: "The colour of the rays and of the glow around the disc. A little deeper than the disc colour looks most like fire.",
				default: "#ff9d4d"
			},
			radius: {
				kind: "number",
				label: "Size",
				guide: "How big the disc is. Around 0.15 to 0.2 sits well; much larger covers the winner's name.",
				default: .17,
				min: .02,
				max: .5,
				step: .01
			},
			rays: {
				kind: "number",
				label: "Rays",
				guide: "How many rays reach out of it. They are not evenly spaced — each one wanders and has its own length.",
				default: 14,
				min: 1,
				max: 60,
				step: 1
			},
			rayLength: {
				kind: "number",
				label: "Ray length",
				guide: "How far the rays reach, counted in disc widths. At 0 only the glow around the disc is left.",
				default: 1.6,
				min: 0,
				max: 8,
				step: .1
			},
			spin: {
				kind: "number",
				label: "Turn",
				guide: "How fast the rays turn around the disc. Negative turns them the other way.",
				default: 1,
				min: -5,
				max: 5,
				step: .1
			},
			surface: {
				kind: "number",
				label: "Surface",
				guide: "How mottled the surface is, as a real sun is. 0 is a flat disc of one colour.",
				default: 1,
				min: 0,
				max: 3,
				step: .1
			},
			intensity: {
				kind: "number",
				label: "Brightness",
				guide: "How brightly it burns.",
				default: 1,
				min: 0,
				max: 2,
				step: .05
			},
			center: CENTER,
			...TIMING_SCHEMA
		}
	},
	clock: {
		label: "Clock face in light",
		description: "A clock face drawn in light, with hands that tick from mark to mark.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The colour of the face and hands.",
				default: "#7dffb0"
			},
			radius: {
				kind: "number",
				label: "Size",
				guide: "How big the face is, compared to the screen.",
				default: .28,
				min: .05,
				max: .5,
				step: .01
			},
			center: CENTER,
			marks: {
				kind: "number",
				label: "Marks",
				guide: "How many marks go round the face. It also sets how far a hand moves on each tick — 12 marks means a twelfth of a turn.",
				default: 12,
				min: 1,
				max: 60,
				step: 1,
				integer: true
			},
			hands: {
				kind: "handList",
				label: "Hands",
				guide: "Up to four. For each one: Speed is ticks per second, and a negative speed runs anticlockwise. Length goes from the centre (0) to the rim (1). Width is how thick it is at the centre — it tapers to a point.",
				default: [{
					rate: 2,
					length: .74,
					width: .03
				}],
				maxItems: 4,
				bounds: {
					rate: {
						min: -30,
						max: 30
					},
					length: {
						min: .05,
						max: 1
					},
					width: {
						min: .005,
						max: .2
					}
				},
				defaultWidth: .03
			},
			intensity: {
				kind: "number",
				label: "Brightness",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	wings: {
		label: "Wings",
		description: "A pair of realistic wings that burst open, or spread above the results and move gently.",
		params: {
			style: {
				kind: "select",
				label: "Style",
				guide: "Feathered wings, like a bird or an angel, or leathery wings, like a bat or a dragon.",
				default: "feathered",
				options: [{
					value: "feathered",
					label: "Feathered"
				}, {
					value: "leathery",
					label: "Leathery"
				}]
			},
			motion: {
				kind: "select",
				label: "Movement",
				guide: "Burst open starts with the wings curled up and snaps them open, throwing off feathers. Open above has them spread from the start, moving gently.",
				default: "burst",
				options: [{
					value: "burst",
					label: "Burst open"
				}, {
					value: "gentle",
					label: "Open above"
				}]
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints the feathers or skin. White keeps their natural colour.",
				default: "#ffffff"
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How big the wings are, compared to the screen. Around 0.35 spans a phone from edge to edge; larger runs off the sides. On a wide screen the same size is a little smaller, so the wings fit above the results.",
				default: .34,
				min: .1,
				max: 1,
				step: .01
			},
			flap: {
				kind: "number",
				label: "Wingbeats",
				guide: "Beats per second once they have opened. 0 holds them still.",
				default: .5,
				min: 0,
				max: 4,
				step: .1,
				unit: "/s"
			},
			center: {
				...CENTER,
				default: [.5, .76]
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	eyes: {
		label: "Eyes",
		description: "Eyes that open around the screen, look about and blink.",
		params: {
			count: {
				kind: "number",
				label: "Amount",
				guide: "How many eyes. They keep clear of the middle of the screen, so if there is not room for them all, fewer appear.",
				default: 9,
				min: 1,
				max: 24,
				step: 1,
				integer: true
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How wide each eye is, compared to the screen. Each one varies a little around this.",
				default: .12,
				min: .04,
				max: .3,
				step: .01
			},
			irisColor: {
				kind: "color",
				label: "Eye colour",
				guide: "The colour of the iris, around the black pupil.",
				default: "#c98a2a"
			},
			gaze: {
				kind: "select",
				label: "Looking",
				guide: "At the winner turns every eye towards the middle of the screen. Around lets each one glance about on its own.",
				default: "winner",
				options: [{
					value: "winner",
					label: "At the winner"
				}, {
					value: "wander",
					label: "Around"
				}]
			},
			blinkRate: {
				kind: "number",
				label: "Blinking",
				guide: "Roughly how often each eye blinks, per second. 0 never blinks.",
				default: .25,
				min: 0,
				max: 2,
				step: .05,
				unit: "/s"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	slashes: {
		label: "Slashes",
		description: "Cuts that tear across the screen one after another and stay as scars.",
		params: {
			style: {
				kind: "select",
				label: "Style",
				guide: "Glowing claws look like fresh wounds of light. Dark claws tear black cuts with a glowing edge. Blade cuts are one clean, bright stroke each.",
				default: "claws",
				options: [
					{
						value: "claws",
						label: "Glowing claws"
					},
					{
						value: "tears",
						label: "Dark claws"
					},
					{
						value: "blade",
						label: "Blade cuts"
					}
				]
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "The colour of the glow.",
				default: "#ff2a2a"
			},
			count: {
				kind: "number",
				label: "Slashes",
				guide: "How many slashes appear, one after another.",
				default: 3,
				min: 1,
				max: 8,
				step: 1,
				integer: true
			},
			lines: {
				kind: "number",
				label: "Marks per slash",
				guide: "Parallel marks in each claw slash. Blade cuts always make a single cut, whatever this is set to.",
				default: 3,
				min: 1,
				max: 5,
				step: 1,
				integer: true
			},
			width: {
				kind: "number",
				label: "Thickness",
				guide: "How thick each cut is at its widest, compared to the screen.",
				default: .012,
				min: .002,
				max: .05,
				step: .001
			},
			interval: {
				kind: "number",
				label: "Time between slashes",
				guide: "Seconds between one slash and the next.",
				default: .35,
				min: .05,
				max: 3,
				step: .05,
				unit: "s"
			},
			swipe: {
				kind: "number",
				label: "Tear speed",
				guide: "Seconds each slash takes to tear across. Smaller is faster and sharper.",
				default: .16,
				min: .02,
				max: 2,
				step: .01,
				unit: "s"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	creatures: {
		label: "Creatures",
		description: "Creatures made of light: a whale drifting across, or small things scurrying along an edge.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "One whale crossing the screen with its tail beating, or a crowd of small things running along an edge.",
				default: "whale",
				options: [{
					value: "whale",
					label: "Whale"
				}, {
					value: "critters",
					label: "Critters"
				}]
			},
			edge: {
				kind: "select",
				label: "Along",
				guide: "Which edge the critters run along. A whale crosses the middle whatever this says.",
				default: "bottom",
				options: [
					{
						value: "bottom",
						label: "Bottom"
					},
					{
						value: "top",
						label: "Top"
					},
					{
						value: "left",
						label: "Left"
					},
					{
						value: "right",
						label: "Right"
					}
				]
			},
			direction: {
				kind: "select",
				label: "Towards",
				guide: "Which way they travel. A few critters always run against it, so the crowd is not a parade.",
				default: "left",
				options: [{
					value: "left",
					label: "Left"
				}, {
					value: "right",
					label: "Right"
				}]
			},
			lane: {
				kind: "number",
				label: "Height",
				guide: "How high the whale swims, from the bottom (0) to the top (1). It rises and falls a little as it goes. Critters ignore it — they follow their edge.",
				default: .6,
				min: 0,
				max: 1,
				step: .05
			},
			count: {
				kind: "number",
				label: "How many",
				guide: "How many critters. A whale is always one.",
				default: 10,
				min: 1,
				max: 40,
				step: 1,
				integer: true
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How long the whale is, or how tall a critter is, compared to the screen. On a wide screen a whale of the same size is a little smaller, so it fits above the results.",
				default: .45,
				min: .03,
				max: 1.2,
				step: .01
			},
			speed: {
				kind: "number",
				label: "Speed",
				guide: "How fast they move. It also sets how fast the whale beats its tail.",
				default: 1,
				min: .1,
				max: 5,
				step: .1
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints them. They are made of light, so dark colours barely show.",
				default: "#bfe8ff"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	curtain: {
		label: "Curtain",
		description: "A silk curtain on a rod, falling over the results or across the whole screen.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "Falling comes down from a rod at the top; rising comes up from the bottom, with no rod.",
				default: "falling",
				options: [{
					value: "falling",
					label: "Falling"
				}, {
					value: "rising",
					label: "Rising"
				}]
			},
			over: {
				kind: "select",
				label: "Over",
				guide: "The results hangs it over the box the winner is shown in, sized to it on every screen. The whole screen hangs it from edge to edge.",
				default: "results",
				options: [{
					value: "results",
					label: "The results"
				}, {
					value: "screen",
					label: "The whole screen"
				}]
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "The cloth. It is painted over the screen, so black works — but a shade just above black is what lets the folds show at all.",
				default: "#0b0b0e"
			},
			coverage: {
				kind: "number",
				label: "How far",
				guide: "How far down it comes before it stops. 1 comes all the way down — over the results, just past the bottom of the box.",
				default: 1,
				min: .1,
				max: 1,
				step: .05
			},
			fall: {
				kind: "number",
				label: "Fall time",
				guide: "Seconds it takes to come down. It settles with a sway rather than stopping dead.",
				default: .9,
				min: .1,
				max: 5,
				step: .1,
				unit: "s"
			},
			folds: {
				kind: "number",
				label: "Folds",
				guide: "How many folds run down the cloth.",
				default: 9,
				min: 1,
				max: 30,
				step: 1,
				integer: true
			},
			sheen: {
				kind: "number",
				label: "Sheen",
				guide: "How much it shines down each fold, as silk does. 0 is matt cloth. The shine is a lighter shade of the colour, so black silk shines silver.",
				default: .8,
				min: 0,
				max: 1,
				step: .05
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid cloth).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	candles: {
		label: "Candles",
		description: "Candles that catch one after another and burn, lighting what is around them.",
		params: {
			count: {
				kind: "number",
				label: "How many",
				guide: "How many candles stand there. They catch one after another, not together.",
				default: 1,
				min: 1,
				max: 7,
				step: 1,
				integer: true
			},
			center: {
				...CENTER,
				default: [.5, .3]
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall a candle is, compared to the screen. The flame is sized from it. On a wide screen the same size is a little smaller, so it fits below the results.",
				default: .22,
				min: .05,
				max: .6,
				step: .01
			},
			spread: {
				kind: "number",
				label: "Spread",
				guide: "How far apart several candles stand. Ignored when there is only one.",
				default: .3,
				min: 0,
				max: 1,
				step: .05
			},
			color: {
				kind: "color",
				label: "Flame colour",
				guide: "The flame, and the light it throws. The core stays white and the foot stays blue whatever this is.",
				default: "#ffb03a"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	weapons: {
		label: "Weapons",
		description: "Weapons at the sides of the screen, firing across it.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "Which weapon stands there, and what it fires. One kind per effect, so a mixed battery is this effect several times over.",
				default: "pistol",
				options: [
					{
						value: "pistol",
						label: "Pistol"
					},
					{
						value: "rifle",
						label: "Rifle"
					},
					{
						value: "cannon",
						label: "Cannon"
					},
					{
						value: "laser",
						label: "Laser"
					},
					{
						value: "bow",
						label: "Bow"
					},
					{
						value: "missile",
						label: "Rockets"
					}
				]
			},
			side: {
				kind: "select",
				label: "Side",
				guide: "Which side they come in from.",
				default: "both",
				options: [
					{
						value: "left",
						label: "Left"
					},
					{
						value: "right",
						label: "Right"
					},
					{
						value: "both",
						label: "Both"
					}
				]
			},
			count: {
				kind: "number",
				label: "How many",
				guide: "How many weapons on each side, spread down the edge.",
				default: 3,
				min: 1,
				max: 6,
				step: 1,
				integer: true
			},
			rate: {
				kind: "number",
				label: "Rate of fire",
				guide: "Shots a second from each weapon. They each keep their own time, so they never fire in unison.",
				default: 1.2,
				min: .1,
				max: 8,
				step: .1,
				unit: "/s"
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall a weapon is, compared to the screen. The shots are sized from it.",
				default: .18,
				min: .05,
				max: .5,
				step: .01
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints the weapons and their shots. White keeps metal, wood and flame as drawn.",
				default: "#ffffff"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	hands: {
		label: "Hands",
		description: "Hands reaching in from an edge of the screen, one after another.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "An open hand shows its palm. A handshake is held out side on, thumb up, from a suit sleeve — an offer of a deal; it points along whichever edge it comes from, so it reads best from the left or right. Machine and porcelain hold the open pose in metal and in glazed china.",
				default: "open",
				options: [
					{
						value: "open",
						label: "Open hand"
					},
					{
						value: "deal",
						label: "Handshake"
					},
					{
						value: "robotic",
						label: "Machine"
					},
					{
						value: "porcelain",
						label: "Porcelain"
					}
				]
			},
			edge: {
				kind: "select",
				label: "From",
				guide: "Which edge they reach in from.",
				default: "bottom",
				options: [
					{
						value: "bottom",
						label: "Bottom"
					},
					{
						value: "top",
						label: "Top"
					},
					{
						value: "left",
						label: "Left"
					},
					{
						value: "right",
						label: "Right"
					}
				]
			},
			count: {
				kind: "number",
				label: "How many",
				guide: "How many hands come in, spread along the edge and arriving one after another.",
				default: 1,
				min: 1,
				max: 8,
				step: 1,
				integer: true
			},
			position: {
				kind: "number",
				label: "Position",
				guide: "Where along the edge they come in: 0 is the left end (or the bottom, on a side edge) and 1 the other end. Several hands spread out around it.",
				default: .5,
				min: 0,
				max: 1,
				step: .01
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall a hand is with its forearm, compared to the screen. They vary a little around this. On a wide screen the same size is a little smaller, so they fit beside the results.",
				default: .6,
				min: .1,
				max: 1.4,
				step: .02
			},
			reach: {
				kind: "number",
				label: "Reach",
				guide: "How far in they come, as a share of their own height. About 0.6 brings the hand in to the wrist; 1 brings the whole forearm.",
				default: .75,
				min: .1,
				max: 1,
				step: .05
			},
			tilt: {
				kind: "number",
				label: "Tilt",
				guide: "Turns them, in degrees. Positive turns clockwise, whichever edge they come from.",
				default: 0,
				min: -90,
				max: 90,
				step: 1,
				unit: "°"
			},
			spread: {
				kind: "number",
				label: "Spread",
				guide: "How much of the edge they are spread along. 0 stacks them in the middle, 1 uses the whole edge.",
				default: .7,
				min: 0,
				max: 1,
				step: .05
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints them. White keeps skin, metal or china as drawn.",
				default: "#ffffff"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	figure: {
		label: "Figure",
		description: "Someone standing behind the results, faceless and far back.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "Which figure stands there.",
				default: "suit",
				options: [{
					value: "suit",
					label: "Suit"
				}]
			},
			center: {
				...CENTER,
				default: [.5, .42]
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall it is, compared to the screen.",
				default: .8,
				min: .2,
				max: 2,
				step: .05
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints it. White keeps the cloth as drawn.",
				default: "#ffffff"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid). Low is the point — at full strength it simply blocks the screen.",
				default: .3,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	timepieces: {
		label: "Clocks",
		description: "A machine for telling the time: a clock, a digital one, an hourglass or a metronome.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "Which machine it is. One effect shows one machine, so a wall of them is this effect several times over, each with its own kind, place and size.",
				default: "analogue",
				options: [
					{
						value: "analogue",
						label: "Clock"
					},
					{
						value: "digital",
						label: "Digital"
					},
					{
						value: "hourglass",
						label: "Hourglass"
					},
					{
						value: "metronome",
						label: "Metronome"
					}
				]
			},
			center: {
				...CENTER,
				default: [.2, .7]
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall it is, compared to the screen.",
				default: .2,
				min: .05,
				max: .6,
				step: .01
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints the whole machine. White keeps the colours it was drawn in — metal, wood and glass.",
				default: "#ffffff"
			},
			speed: {
				kind: "number",
				label: "Speed",
				guide: "Ticks a second for a clock, beats a second for a metronome, and how many times the hourglass empties over the hold. A digital clock counts at this rate.",
				default: 1,
				min: .1,
				max: 10,
				step: .1
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	glitch: {
		label: "Glitch",
		description: "The picture breaking up in bursts: torn slices, split colour, or static.",
		params: {
			style: {
				kind: "select",
				label: "Kind",
				guide: "Torn slices slide bands of the picture sideways. Split colour separates it into red and cyan ghosts. Static fills blocks with noise.",
				default: "tear",
				options: [
					{
						value: "tear",
						label: "Torn slices"
					},
					{
						value: "split",
						label: "Split colour"
					},
					{
						value: "blocks",
						label: "Static"
					}
				]
			},
			color: {
				kind: "color",
				label: "Colour",
				guide: "Tints the bands. Split colour keeps its red and cyan whatever this is.",
				default: "#8ad7ff"
			},
			rate: {
				kind: "number",
				label: "Bursts",
				guide: "How many times a second it breaks up. Between bursts the screen is left alone, which is what makes it read as a fault.",
				default: 3,
				min: .2,
				max: 12,
				step: .1,
				unit: "/s"
			},
			coverage: {
				kind: "number",
				label: "How much",
				guide: "How much of the screen each burst touches, from a few slices (0.1) to nearly all of it (1).",
				default: .35,
				min: .05,
				max: 1,
				step: .05
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (full).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	words: {
		label: "Words",
		description: "Words that pop up around the screen, lettered like meme captions.",
		params: {
			words: {
				kind: "textList",
				label: "Words",
				guide: "Up to eight, in any language. They take turns, so each one appears about as often as the others.",
				default: ["WOW", "OMG"],
				maxItems: 8,
				maxLength: 24,
				itemLabel: "word"
			},
			count: {
				kind: "number",
				label: "Amount",
				guide: "How many words appear in all, one after another. They keep clear of the middle of the screen, so if there is not room, some overlap.",
				default: 12,
				min: 1,
				max: 40,
				step: 1,
				integer: true
			},
			colors: {
				kind: "colorList",
				label: "Colours",
				guide: "Up to four. Each word picks one at random.",
				default: ["#ffffff"],
				maxItems: 4
			},
			outlineColor: {
				kind: "color",
				label: "Outline",
				guide: "The thick edge round every letter. Black is the classic meme look.",
				default: "#000000"
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How tall the letters are, compared to the screen. A long word is shrunk to fit if it would not.",
				default: .07,
				min: .02,
				max: .2,
				step: .005
			},
			tilt: {
				kind: "number",
				label: "Tilt",
				guide: "The most a word can lean either way. 0 keeps them all level.",
				default: 20,
				min: 0,
				max: 60,
				step: 1,
				unit: "°"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	memes: {
		label: "Memes",
		description: "Meme GIFs playing at random spots around the screen, a different few each time.",
		params: {
			gifs: {
				kind: "giphyList",
				label: "GIFs",
				guide: "The GIFs to pick from — it starts with a set of well-known memes. To add one, find it on giphy.com, copy its address or use its Copy link button, and paste it here. Each time, a random few from the list play.",
				default: [...MEME_GIFS],
				maxItems: 48
			},
			count: {
				kind: "number",
				label: "At once",
				guide: "How many play at the same time. They keep clear of the middle of the screen.",
				default: 4,
				min: 1,
				max: 8,
				step: 1,
				integer: true
			},
			size: {
				kind: "number",
				label: "Size",
				guide: "How big each one is, compared to the screen.",
				default: .3,
				min: .1,
				max: .6,
				step: .01
			},
			tilt: {
				kind: "number",
				label: "Tilt",
				guide: "The most one can lean either way. 0 keeps them all level.",
				default: 10,
				min: 0,
				max: 45,
				step: 1,
				unit: "°"
			},
			intensity: {
				kind: "number",
				label: "Strength",
				guide: "From 0 (invisible) to 1 (solid).",
				default: 1,
				min: 0,
				max: 1,
				step: .05
			},
			...TIMING_SCHEMA
		}
	},
	beams: {
		label: "Light beams",
		description: "Soft shafts of light across the top of the screen.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The colour of the light.",
				default: "#fff2b2"
			},
			...TIMING_SCHEMA
		}
	},
	fire: {
		label: "Flame",
		description: "A flickering flame drawn on a flat panel.",
		params: {
			color: {
				kind: "color",
				label: "Colour",
				guide: "The flame's colour. Brighter colours burn hotter at the core.",
				default: "#ff4400"
			},
			scale: {
				kind: "scale",
				label: "Size",
				guide: "How big the flame is. One number grows it evenly; three set width, height and depth.",
				default: 1,
				min: .1,
				max: 10
			},
			position: {
				kind: "vec3",
				label: "Position",
				guide: "Where the flame sits: left and right, down and up, then towards you. 0, 0, 0 is the middle of the screen; the default puts it near the bottom.",
				default: [
					0,
					-2,
					0
				],
				min: -10,
				max: 10
			},
			...TIMING_SCHEMA
		}
	}
};
/**
* Effects kept out of the builder's list. Their schemas stay, so an animation
* already saved with one still loads, plays and can be edited — removing the
* type outright would make the sanitiser drop those animations.
*/
var RETIRED_EFFECTS = new Set(["fire"]);
Object.keys(EFFECT_SCHEMAS).filter((type) => !RETIRED_EFFECTS.has(type));
/**
* Own properties only. `'constructor' in EFFECT_SCHEMAS` is true, and a saved
* animation claiming to be a `constructor` effect must not get past this.
*/
function isEffectType(value) {
	return typeof value === "string" && Object.hasOwn(EFFECT_SCHEMAS, value);
}
function build(type, source) {
	const params = EFFECT_SCHEMAS[type].params;
	const out = { type };
	for (const [key, spec] of Object.entries(params)) out[key] = sanitizeValue(spec, source[key]);
	return out;
}
/**
* Turn anything — a saved animation, an imported code, a form's state — into
* an effect that is safe to render, or null if it is not an effect at all.
*
* Every parameter comes out present and in range: keys the effect does not
* take are dropped, missing or malformed values become the default, and
* numbers are clamped. That is what keeps one bad value from freezing the
* phone of whoever's spin lands on it — a saved animation cannot ask for ten
* million sparks.
*/
function sanitizeModule(input) {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const { type } = input;
	if (!isEffectType(type)) return null;
	return build(type, input);
}
//#endregion
//#region src/animations/presentation.ts
/** The app's brand colour — the same one resolvePresentation falls back to. */
var BRAND = "#646cff";
var PRESENTATION_SCHEMA = {
	title: {
		kind: "text",
		label: "Title",
		guide: "The heading at the top of the results.",
		default: "🎊 The Results are In! 🎊",
		maxLength: 60
	},
	accentColor: {
		kind: "color",
		label: "Accent colour",
		guide: "Colours the border and the winner's name.",
		default: BRAND
	},
	backgroundColor: {
		kind: "color",
		label: "Background",
		guide: "Behind the results. It can be partly see-through.",
		default: "#1e1e1ef2",
		alpha: true
	},
	glowColor: {
		kind: "color",
		label: "Glow colour",
		guide: "The colour of the light around the results.",
		default: BRAND
	},
	glowSize: {
		kind: "number",
		label: "Glow size",
		guide: "How far that light spreads, in pixels. 0 for none.",
		default: 50,
		min: 0,
		max: 150,
		step: 1,
		integer: true,
		unit: "px"
	},
	buttonColor: {
		kind: "color",
		label: "Button colour",
		guide: "The colour of the button that closes the results.",
		default: BRAND
	},
	buttonTextColor: {
		kind: "color",
		label: "Button text",
		guide: "The colour of the words on that button. Pick something that stands out against the button.",
		default: "#ffffff"
	},
	fontFamily: {
		kind: "select",
		label: "Font",
		guide: "The lettering of the title and the winner's name. Most phones don't have these exact fonts and use the closest style they do have — a serif, a typewriter face, or a plain one.",
		default: "default",
		options: [
			{
				value: "default",
				label: "App default"
			},
			{
				value: "palatino",
				label: "Palatino"
			},
			{
				value: "georgia",
				label: "Georgia"
			},
			{
				value: "typewriter",
				label: "Typewriter"
			},
			{
				value: "impact",
				label: "Impact"
			}
		]
	},
	letterSpacing: {
		kind: "number",
		label: "Letter spacing",
		guide: "Extra space between letters, in pixels. A little makes a title feel grander.",
		default: 0,
		min: 0,
		max: 10,
		step: .5,
		unit: "px"
	},
	textGlowColor: {
		kind: "color",
		label: "Text glow colour",
		guide: "The colour of the glow around the title and name.",
		default: BRAND
	},
	textGlowSize: {
		kind: "number",
		label: "Text glow size",
		guide: "How far that glow spreads, in pixels. 0 for none.",
		default: 0,
		min: 0,
		max: 40,
		step: 1,
		integer: true,
		unit: "px"
	},
	shake: {
		kind: "boolean",
		label: "Shake",
		guide: "Shakes the results for about a second when they appear.",
		default: false
	},
	glitch: {
		kind: "boolean",
		label: "Glitch",
		guide: "Makes the title flicker, and flashes red and blue behind the results as they appear.",
		default: false
	}
};
/** Anything in, a complete and valid set of modal styles out. Never throws. */
function sanitizePresentation(input) {
	const source = typeof input === "object" && input !== null && !Array.isArray(input) ? input : {};
	const specs = PRESENTATION_SCHEMA;
	const out = {};
	for (const [key, spec] of Object.entries(specs)) out[key] = sanitizeValue(spec, source[key]);
	return out;
}
//#endregion
//#region src/animations/timing.ts
/**
* One timing for every effect in an animation.
*
* Stored on the animation, and written into each of its effects whenever the
* animation is sanitised. Playback therefore never has to know shared timing
* exists, and an export opened by a build from before it still plays the same.
*/
/** Fade in, hold, fade out — the same labels, guides and bounds each effect has. */
var TIMING_FIELDS = Object.keys(TIMING_SCHEMA).map((key) => [key, TIMING_SCHEMA[key]]);
/** A complete timing, every value in range, from anything. Never throws. */
function sanitizeTiming(input) {
	const source = typeof input === "object" && input !== null && !Array.isArray(input) ? input : {};
	const out = {};
	for (const [key, spec] of TIMING_FIELDS) out[key] = sanitizeValue(spec, source[key]);
	return out;
}
/**
* Shared timing, or null for none. Anything that is not an object counts as
* none, which is how an animation saved before shared timing existed loads.
*/
function sanitizeSharedTiming(input) {
	return typeof input === "object" && input !== null && !Array.isArray(input) ? sanitizeTiming(input) : null;
}
/** Every effect given this timing. Null leaves each with its own. */
function withTiming(modules, timing) {
	if (!timing) return modules;
	return modules.map((module) => ({
		...module,
		...timing
	}));
}
var ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
/**
* Case and spacing do not matter — "Jack", "jack " and "JACK" are one name —
* and Unicode that looks identical is made identical, so two keyboards that
* encode the same word differently still agree on it.
*/
function normalizeUsername(raw) {
	const collapsed = raw.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
	return Array.from(collapsed).slice(0, 40).join("");
}
/**
* Exact, apart from surrounding whitespace and Unicode normalisation. The
* character is picked from the loaded list rather than typed, so there is no
* need for the prefix matching the built-in animations use — and no risk of
* one name catching another that begins the same way.
*/
function sameCharacter(a, b) {
	return a.normalize("NFC").trim() === b.normalize("NFC").trim();
}
function newAnimationId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
/**
* An animation safe to keep and to play, or null if nothing usable is left.
* One with no character, or no effects that survive sanitising, is dropped
* rather than kept as an empty shell.
*/
function sanitizeAnimation(input) {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const raw = input;
	const character = typeof raw.character === "string" ? Array.from(raw.character.normalize("NFC").trim()).slice(0, 200).join("") : "";
	if (!character) return null;
	const modules = Array.isArray(raw.modules) ? raw.modules.map((module) => sanitizeModule(module)).filter((module) => module !== null).slice(0, 8) : [];
	if (modules.length === 0) return null;
	const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0;
	const timing = sanitizeSharedTiming(raw.timing);
	return {
		id: typeof raw.id === "string" && ID_PATTERN.test(raw.id) ? raw.id : newAnimationId(),
		character,
		modules: withTiming(modules, timing),
		presentation: sanitizePresentation(raw.presentation),
		timing,
		updatedAt
	};
}
//#endregion
//#region server/animations.ts
/**
* Where the database is, and the key to it, from the variables Vercel adds
* when one is connected to the project. Upstash's own names come first, then
* Vercel's `KV_REST_API_*`, then anything ending in `REST_API_URL`: the
* connect dialog offers a custom prefix, which turns `KV_REST_API_URL` into,
* say, `STORAGE_KV_REST_API_URL`, and that must not quietly leave sharing
* switched off. The read-only token is never taken for the real one.
*/
function redisCredentials(env) {
	const names = Object.keys(env).sort((a, b) => a.length - b.length);
	for (const ending of [
		"UPSTASH_REDIS_REST_URL",
		"KV_REST_API_URL",
		"REST_API_URL"
	]) for (const name of names) {
		if (!name.endsWith(ending)) continue;
		const url = env[name];
		const token = env[`${name.slice(0, -3)}TOKEN`];
		if (url?.startsWith("https://") && token) return {
			url,
			token
		};
	}
	return null;
}
/**
* Why `redisCredentials` found nothing, in one word, for the 503 to carry.
* Names and values never leave the function — only which shape was seen, and
* that is what tells a database connected to the wrong project (nothing)
* apart from one that speaks the wrong protocol (connection-string) or a
* half-set pair (url-without-token).
*/
function missingReason(env) {
	const set = Object.keys(env).filter((name) => env[name]);
	const has = (ending) => set.some((name) => name.endsWith(ending));
	if (has("REST_API_URL")) return "url-without-token";
	if (has("REDIS_URL") || has("KV_URL")) return "connection-string-only";
	return "nothing-connected";
}
/** Upstash Redis, wherever those variables say it is. */
function upstashStore(env = process.env) {
	const credentials = redisCredentials(env);
	if (!credentials) return null;
	const redis = new Redis2({
		...credentials,
		automaticDeserialization: false
	});
	return {
		hgetall: (key) => redis.hgetall(key),
		hset: (key, values) => redis.hset(key, values),
		hdel: (key, ...fields) => redis.hdel(key, ...fields),
		get: (key) => redis.get(key),
		setIfAbsent: async (key, value) => await redis.set(key, value, { nx: true }) === "OK",
		incr: (key) => redis.incr(key),
		expire: (key, seconds) => redis.expire(key, seconds)
	};
}
/** A map behind the same interface, for testing without Redis. */
function memoryStore() {
	const hashes = /* @__PURE__ */ new Map();
	const strings = /* @__PURE__ */ new Map();
	return {
		hgetall: async (key) => {
			const hash = hashes.get(key);
			return hash && hash.size > 0 ? Object.fromEntries(hash) : null;
		},
		hset: async (key, values) => {
			const hash = hashes.get(key) ?? /* @__PURE__ */ new Map();
			for (const [field, value] of Object.entries(values)) hash.set(field, value);
			hashes.set(key, hash);
		},
		hdel: async (key, ...fields) => {
			for (const field of fields) hashes.get(key)?.delete(field);
		},
		get: async (key) => strings.get(key) ?? null,
		setIfAbsent: async (key, value) => {
			if (strings.has(key)) return false;
			strings.set(key, value);
			return true;
		},
		incr: async (key) => {
			const next = Number(strings.get(key) ?? 0) + 1;
			strings.set(key, String(next));
			return next;
		},
		expire: async () => void 0
	};
}
/** Wrong PINs allowed per name per hour, before it stops checking. */
var MAX_TRIES = 10;
var TRY_WINDOW_SECONDS = 3600;
/** A request bigger than this is refused before it is looked at. */
var MAX_BODY_CHARS = 4e5;
var keys = (name) => {
	const safe = encodeURIComponent(name);
	return {
		animations: `dmuyot:anim:${safe}`,
		pin: `dmuyot:pin:${safe}`,
		tries: `dmuyot:tries:${safe}`
	};
};
/** Four to twenty characters, counted as characters rather than UTF-16 units. */
function validPin(pin) {
	if (typeof pin !== "string") return false;
	const length = Array.from(pin.trim()).length;
	return length >= 4 && length <= 20;
}
/** scrypt, salted: slow to guess even for a PIN this short. */
function hashPin(pin, salt = randomBytes(16)) {
	return `${salt.toString("hex")}$${scryptSync(pin.trim(), salt, 32).toString("hex")}`;
}
function pinMatches(pin, stored) {
	const [saltHex, hashHex] = stored.split("$");
	if (!saltHex || !hashHex) return false;
	const expected = Buffer.from(hashHex, "hex");
	const actual = scryptSync(pin.trim(), Buffer.from(saltHex, "hex"), 32);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
var fail = (status, error, message) => ({
	status,
	body: {
		ok: false,
		error,
		message
	}
});
async function readAnimations(store, name) {
	const raw = await store.hgetall(keys(name).animations) ?? {};
	const found = /* @__PURE__ */ new Map();
	for (const value of Object.values(raw)) try {
		const animation = sanitizeAnimation(typeof value === "string" ? JSON.parse(value) : value);
		if (animation) found.set(animation.id, animation);
	} catch {}
	return found;
}
var newestFirst = (animations) => [...animations].sort((a, b) => b.updatedAt - a.updatedAt);
/**
* Checks the PIN for a change. A name nobody has claimed takes the PIN given,
* if there is one, and is claimed by it. Returns the failure, or whether the
* name is now claimed.
*/
async function authorise(store, name, pin) {
	const k = keys(name);
	let stored = await store.get(k.pin);
	if (stored === null) {
		if (!validPin(pin)) return { claimed: false };
		if (await store.setIfAbsent(k.pin, hashPin(pin))) return { claimed: true };
		stored = await store.get(k.pin);
		if (stored === null) return { claimed: false };
	}
	if (Number(await store.get(k.tries) ?? 0) >= MAX_TRIES) return fail(429, "too-many-tries", "Too many wrong PINs for this name. Try again in an hour.");
	if (!validPin(pin) || !pinMatches(pin, stored)) {
		if (await store.incr(k.tries) === 1) await store.expire(k.tries, TRY_WINDOW_SECONDS);
		return fail(403, "wrong-pin", "That PIN doesn't match this name's.");
	}
	return { claimed: true };
}
/** The request, already parsed — independent of how Vercel delivers it. */
async function handle(method, query, body, store) {
	if (!store) return fail(503, "no-storage", `Shared storage is not connected yet (${missingReason(process.env)}).`);
	if (method === "GET") {
		const name = normalizeUsername(query.get("user") ?? "");
		if (!name) return fail(400, "no-name", "Which name?");
		return {
			status: 200,
			body: {
				ok: true,
				claimed: await store.get(keys(name).pin) !== null,
				animations: newestFirst((await readAnimations(store, name)).values())
			}
		};
	}
	if (method !== "POST") return fail(405, "method", "Only GET and POST.");
	if (typeof body !== "object" || body === null) return fail(400, "bad-request", "Expected a JSON body.");
	const request = body;
	const name = normalizeUsername(typeof request.user === "string" ? request.user : "");
	if (!name) return fail(400, "no-name", "Which name?");
	const auth = await authorise(store, name, request.pin);
	if ("status" in auth) return auth;
	if (request.op === "check") return {
		status: 200,
		body: {
			ok: true,
			claimed: auth.claimed
		}
	};
	if (request.op !== "apply") return fail(400, "bad-request", "Unknown operation.");
	const current = await readAnimations(store, name);
	const removed = /* @__PURE__ */ new Set();
	const written = /* @__PURE__ */ new Map();
	for (const id of Array.isArray(request.deletes) ? request.deletes : []) if (typeof id === "string" && ID_PATTERN.test(id) && current.delete(id)) removed.add(id);
	for (const raw of Array.isArray(request.upserts) ? request.upserts : []) {
		const incoming = sanitizeAnimation(raw);
		if (!incoming) continue;
		const rival = [...current.values()].find((other) => other.id !== incoming.id && sameCharacter(other.character, incoming.character));
		if (rival) {
			if (rival.updatedAt > incoming.updatedAt) continue;
			current.delete(rival.id);
			written.delete(rival.id);
			removed.add(rival.id);
		}
		current.set(incoming.id, incoming);
		written.set(incoming.id, incoming);
		removed.delete(incoming.id);
	}
	if (current.size > 100) return fail(413, "too-many", `A name can hold at most 100 animations.`);
	const k = keys(name);
	if (removed.size > 0) await store.hdel(k.animations, ...removed);
	if (written.size > 0) await store.hset(k.animations, Object.fromEntries([...written].map(([id, animation]) => [id, JSON.stringify(animation)])));
	return {
		status: 200,
		body: {
			ok: true,
			claimed: auth.claimed,
			animations: newestFirst(current.values())
		}
	};
}
/** The body, whether Vercel has parsed it already or left the stream unread. */
async function readBody(req) {
	if (req.body !== void 0) {
		if (typeof req.body !== "string") return req.body;
		if (req.body.length > MAX_BODY_CHARS) return void 0;
		try {
			return JSON.parse(req.body);
		} catch {
			return;
		}
	}
	let text = "";
	for await (const chunk of req) {
		text += chunk;
		if (text.length > MAX_BODY_CHARS) return void 0;
	}
	try {
		return text ? JSON.parse(text) : void 0;
	} catch {
		return;
	}
}
async function vercelHandler(req, res) {
	let result;
	try {
		const url = new URL(req.url ?? "/", "http://localhost");
		const body = req.method === "POST" ? await readBody(req) : void 0;
		result = await handle(req.method ?? "GET", url.searchParams, body, upstashStore());
	} catch (error) {
		console.error("[animations]", error);
		result = fail(500, "server", "Something went wrong on the server.");
	}
	res.statusCode = result.status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(result.body));
}
//#endregion
export { vercelHandler as default, handle, memoryStore, missingReason, redisCredentials, upstashStore };
