const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { IP2Location } = require("../src/ip2LocationArray");
const { IP2Location: FileIP2Location } = require("../src/ip2location");

// Synthetic DB1 with two ranges per address family and both index tables.
// No licensed database, network access, or test framework is required.
function fixture() {
	const indexBytes = 65536 * 8;
	const ipv4 = 64 + indexBytes * 2;
	const ipv6 = ipv4 + 24;
	const probes = ipv6 + 60;
	const strings = probes + 24;
	const country = Buffer.from("\x02US\x0eUnited States!\x02FR\x07Fran\u00e7e", "utf8");
	const buffer = Buffer.alloc(strings + country.length);
	buffer[0] = 1;
	buffer[1] = 2;
	buffer[2] = 24;
	buffer[3] = 1;
	buffer[4] = 1;
	buffer.writeUInt32LE(2, 5);
	buffer.writeUInt32LE(ipv4 + 1, 9);
	buffer.writeUInt32LE(2, 13);
	buffer.writeUInt32LE(ipv6 + 1, 17);
	buffer.writeUInt32LE(65, 21);
	buffer.writeUInt32LE(65 + indexBytes, 25);
	buffer[29] = 1;
	buffer.writeUInt32LE(buffer.length, 31);
	for (let offset = 64; offset < ipv4; offset += 8) {
		buffer.writeUInt32LE(1, offset + 4);
	}
	buffer.writeUInt32LE(strings, ipv4 + 4);
	buffer.writeUInt32LE(0x80000000, ipv4 + 8);
	buffer.writeUInt32LE(strings + 18, ipv4 + 12);
	buffer.writeUInt32LE(0xffffffff, ipv4 + 16);
	buffer.writeUInt32LE(strings, ipv6 + 16);
	buffer[ipv6 + 35] = 0x80;
	buffer.writeUInt32LE(strings + 18, ipv6 + 36);
	buffer.fill(0xff, ipv6 + 40, ipv6 + 56);
	buffer.writeInt32LE(-123456, probes);
	buffer.writeFloatLE(12.5, probes + 4);
	for (let i = 0; i < 16; i++) buffer[probes + 8 + i] = i + 1;
	country.copy(buffer, strings);
	return { buffer, probes, strings };
}

async function checkBuffers(buffer, strings, ips, expected) {
	const db = new IP2Location();
	for (const input of [null, "file.BIN", [], new ArrayBuffer(64), new DataView(new ArrayBuffer(64))]) {
		assert.throws(() => db.openBuffer(input), TypeError);
	}
	assert.throws(() => db.openBuffer(buffer, { copy: "false" }), TypeError);
	for (const input of [Buffer.alloc(0), Buffer.from("PK"), Buffer.alloc(64)]) {
		assert.strictEqual(db.openBuffer(input), false);
		assert.strictEqual(db.getPackageVersion(), 0);
		assert.throws(() => db.read8(1), /not open/);
	}
	const invalid = Buffer.from(buffer);
	invalid[29] = 2;
	assert.strictEqual(db.openBuffer(invalid), false);

	for (const typedArray of [false, true]) {
		// Nonzero byteOffset and extra surrounding bytes must be respected.
		const storage = new Uint8Array(buffer.length + 32);
		storage.set(buffer, 16);
		const data = typedArray
			? storage.subarray(16, 16 + buffer.length)
			: Buffer.from(storage.buffer, 16, buffer.length);
		assert.strictEqual(db.openBuffer(data), true);
		data.fill(0); // Copying by default protects the database.
		for (let i = 0; i < ips.length; i++) {
			assert.deepStrictEqual(db.getAll(ips[i]), expected[i]);
			assert.deepStrictEqual(await db.getAllAsync(ips[i]), expected[i]);
		}
		assert.strictEqual(db.openBuffer(invalid), true); // Already open: no replacement.
		assert.deepStrictEqual(db.getAll("8.8.8.8"), expected[1]);
		assert.strictEqual(db.close(), 0);

		storage.set(buffer, 16);
		assert.strictEqual(db.openBuffer(data, { copy: false }), true);
		assert.deepStrictEqual(db.getAll("8.8.8.8"), expected[1]);
		data[strings + 1] = "X".charCodeAt(0);
		assert.strictEqual(db.getAll("8.8.8.8").countryShort, "XS");
		assert.strictEqual(await db.closeAsync(), 0);
		assert.throws(() => db.read8(1), /not open/);
	}
	// Buffer-only initialization never sets a filename for disk reloads.
	assert.strictEqual(db.loadBin(), false);
	assert.strictEqual(await db.loadBinAsync(), false);
}

async function main() {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ip2location-array-"));
	const binPath = path.join(directory, "synthetic.BIN");
	const { buffer, probes, strings } = fixture();
	const ips = ["0.0.0.0", "8.8.8.8", "128.0.0.0", "255.255.255.255", "::", "2001:4860:4860::8888", "8000::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "::ffff:8.8.8.8", "invalid"];
	try {
		for (const asynchronous of [false, true]) {
			fs.writeFileSync(binPath, buffer);
			const disk = new FileIP2Location();
			const memory = new IP2Location();
			disk.open(binPath);
			if (asynchronous) await memory.openAsync(binPath);
			else memory.open(binPath);
			const expected = ips.map((ip) => disk.getAll(ip));
			assert.strictEqual(expected[1].countryShort, "US");
			assert.strictEqual(expected[2].countryShort, "FR");
			assert.strictEqual(expected[6].countryShort, "FR");
			assert.strictEqual(disk.close(), 0);
			fs.unlinkSync(binPath);

			// Any remaining lookup-related filesystem access is a regression.
			const originals = {};
			for (const method of ["readSync", "read", "readFileSync", "existsSync", "openSync"]) {
				originals[method] = fs[method];
				fs[method] = () => { throw new Error(`Unexpected fs.${method}`); };
			}
			const originalReadFile = fs.promises.readFile;
			fs.promises.readFile = () => { throw new Error("Unexpected async readFile"); };
			try {
				await checkBuffers(buffer, strings, ips, expected);
				for (let i = 0; i < ips.length; i++) {
					assert.deepStrictEqual(memory.getAll(ips[i]), expected[i]);
					assert.deepStrictEqual(await memory.getAllAsync(ips[i]), expected[i]);
				}
				assert.strictEqual(memory.read8(1), 1);
				assert.strictEqual(memory.read32(10), buffer.readUInt32LE(9));
				assert.strictEqual(memory.read32(10, true), BigInt(buffer.readUInt32LE(9)));
				assert.strictEqual(memory.readBin(4, probes, "int32"), -123456);
				assert.strictEqual(memory.readBin(4, probes + 4, "float"), 12.5);
				const big = BigInt("0x100f0e0d0c0b0a090807060504030201");
				assert.strictEqual(memory.read128(probes + 9), big);
				assert.strictEqual(memory.read128Row(0, memory.readRow(16, probes + 9)), big);
				assert.strictEqual(memory.readStr(strings), "US");
				assert.strictEqual(memory.readStr(strings + 21), "Françe");
				assert.strictEqual(await memory.readStrAsync(strings + 21), "Françe");
				assert.strictEqual(memory.readBin(2, strings + 1, "str"), "US");
				assert.strictEqual(memory.readBin(4, buffer.length - 1, "uint32"), 0);
				assert.deepStrictEqual(memory.readRow(4, buffer.length + 1), Buffer.alloc(4));
				assert.deepStrictEqual(await memory.readRowAsync(64, 1), buffer.subarray(0, 64));
				const row = memory.readRow(64, 1);
				row.fill(0);
				assert.strictEqual(memory.read8(1), 1);
				assert.throws(() => memory.readRow(1, 0), RangeError);
				assert.strictEqual(asynchronous ? await memory.closeAsync() : memory.close(), 0);
				assert.throws(() => memory.read8(1), /not open/);
				assert.notStrictEqual(memory.getAll("8.8.8.8").countryShort, "US");
			} finally {
				Object.assign(fs, originals);
				fs.promises.readFile = originalReadFile;
			}

			// Failed loads release partial state and permit a later successful open.
			fs.writeFileSync(binPath, Buffer.from("PK"));
			assert.strictEqual(asynchronous ? await memory.loadBinAsync() : memory.loadBin(), false);
			assert.strictEqual(memory.getPackageVersion(), 0);
			const invalid = Buffer.from(buffer);
			invalid[29] = 2;
			fs.writeFileSync(binPath, invalid);
			assert.strictEqual(asynchronous ? await memory.loadBinAsync() : memory.loadBin(), false);
			assert.strictEqual(memory.getPackageVersion(), 0);
			fs.writeFileSync(binPath, buffer);
			if (asynchronous) await memory.openAsync(binPath);
			else memory.open(binPath);
			assert.strictEqual(memory.getAll("8.8.8.8").countryShort, "US");
			await memory.closeAsync();
			fs.unlinkSync(binPath);
			assert.strictEqual(await memory.loadBinAsync(), false);
			// Switch a formerly file-backed instance to direct bytes, then back.
			assert.strictEqual(memory.openBuffer(buffer), true);
			assert.strictEqual(memory.loadBin(), false);
			assert.strictEqual(memory.getAll("8.8.8.8").countryShort, "US");
			memory.close();
			fs.writeFileSync(binPath, buffer);
			memory.open(binPath);
			assert.strictEqual(memory.getAll("8.8.8.8").countryShort, "US");
			memory.close();
			fs.unlinkSync(binPath);
		}
		console.log("Memory-backed BIN checks passed.");
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
