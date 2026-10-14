import { IP2Location as FileIP2Location } from "./ip2location";

export * from "./ip2location";

export interface OpenBufferOptions {
	/** Copy the bytes by default. If false, do not mutate the data while open. */
	copy?: boolean;
}

export class IP2Location extends FileIP2Location {
	/**
	 * Initialize from Buffer or Uint8Array bytes, with no filesystem access.
	 * Returns false for invalid BIN data and true on success (or if already open).
	 * Close the instance before initializing another database.
	 * Throws TypeError for unsupported input or a non-boolean copy option.
	 */
	openBuffer(data: Uint8Array, options?: OpenBufferOptions): boolean;
}
