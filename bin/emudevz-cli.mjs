#!/usr/bin/env node
import { Instruction } from "@neshacker/6502-tools/src/assembler/Instruction.js";
import { assemble } from "@neshacker/6502-tools/src/assembler/assemble.js";
import ParseNode from "@neshacker/6502-tools/src/parser/ParseNode.js";
import {
	ParseError,
	ParseLine,
} from "@neshacker/6502-tools/src/parser/index.js";
import lineParser from "@neshacker/6502-tools/src/parser/lineParser.js";
import BrokenNEEESModule from "broken-neees";
import chai from "chai";
import JSZip from "jszip";
import NESModule from "nes-emu";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import slug from "slug";
import _ from "lodash";

const ROOT = process.cwd();
const LEVELS_DIR = path.join(ROOT, "src/data/levels");
const GLOBAL_TESTS_DIR = path.join(LEVELS_DIR, "$tests");
const SAVE_LOCALSTORAGE_FILE = "localstorage.json";
const SAVE_INDEXED_DB_FOLDER = "indexeddb";
const DRIVE = {
	CODE_DIR: "/code",
	DOCS_DIR: "/docs",
	LIB_DIR: "/lib",
	TMPL_DIR: "/tmpl",
};

const BrokenNEEES = BrokenNEEESModule.default ?? BrokenNEEESModule;
const NES = NESModule.default ?? NESModule;
let chaiExtensionsInstalled = false;
const ASM_CODE_ADDRESS = 0x4020;
const ASM_TIMEOUT = 3000;

const byte = {
	toU8(s8) {
		return s8 & 0xff;
	},
	toS8(u8) {
		return (u8 << 24) >> 24;
	},
	toU16(value) {
		return value & 0xffff;
	},
	overflows(u8) {
		return u8 >= 256;
	},
	isPositive(s8) {
		return !((s8 >> 7) & 1);
	},
	isNegative(s8) {
		return !!((s8 >> 7) & 1);
	},
	getFlag(number, position) {
		return !!this.getBit(number, position);
	},
	getBit(number, position) {
		return (number >> position) & 1;
	},
	setBit(u8, bit, value) {
		const mask = 1 << bit;
		return (u8 & ~mask) | ((value & 0b1) << bit);
	},
	getBits(u8, startPosition, size) {
		return (u8 >> startPosition) & (0xff >> (8 - size));
	},
	setBits(u8, startPosition, size, value) {
		const mask = ((1 << size) - 1) << startPosition;
		return (u8 & ~mask) | ((value << startPosition) & mask);
	},
	highByteOf(u16) {
		return u16 >> 8;
	},
	lowByteOf(u16) {
		return u16 & 0xff;
	},
	buildU16(highByte, lowByte) {
		return ((highByte & 0xff) << 8) | (lowByte & 0xff);
	},
	highNybbleOf(u8) {
		return u8 >> 4;
	},
	lowNybbleOf(u8) {
		return u8 & 0b1111;
	},
	buildU8(highNybble, lowNybble) {
		return ((highNybble & 0b1111) << 4) | (lowNybble & 0b1111);
	},
	bitfield(bit0, bit1, bit2, bit3, bit4, bit5, bit6, bit7) {
		return (
			((bit0 & 1) << 0) |
			((bit1 & 1) << 1) |
			((bit2 & 1) << 2) |
			((bit3 & 1) << 3) |
			((bit4 & 1) << 4) |
			((bit5 & 1) << 5) |
			((bit6 & 1) << 6) |
			((bit7 & 1) << 7)
		);
	},
	buildU2(highBit, lowBit) {
		return (highBit << 1) | lowBit;
	},
	random(max = 254) {
		return 1 + Math.floor(Math.random() * max);
	},
};

class VirtualFilesystem {
	constructor() {
		this.files = new Map();
	}

	write(filePath, content) {
		this.files.set(normalizeVirtualPath(filePath), content);
	}

	read(filePath) {
		const normalized = normalizeVirtualPath(filePath);
		if (!this.files.has(normalized))
			throw new Error(`File not found: ${normalized}`);
		return this.files.get(normalized);
	}

	exists(filePath) {
		return this.files.has(normalizeVirtualPath(filePath));
	}

	stat(filePath) {
		const normalized = normalizeVirtualPath(filePath);
		if (this.files.has(normalized)) return { isDirectory: false };
		const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
		if ([...this.files.keys()].some((it) => it.startsWith(prefix))) {
			return { isDirectory: true };
		}
		throw new Error(`File not found: ${normalized}`);
	}

	mkdirp() {}

	resolve(relativePath, fromDir = "/") {
		if (relativePath.startsWith("/")) return normalizeVirtualPath(relativePath);
		return normalizeVirtualPath(path.posix.join(fromDir, relativePath));
	}
}

function normalizeVirtualPath(filePath) {
	return path.posix.normalize(`/${filePath}`.replace(/^\/+/, "/"));
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readDirs(dir) {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((it) => it.isDirectory() && !it.name.startsWith("$"))
		.map((it) => it.name)
		.sort();
}

function buildBook() {
	const book = {
		chapters: [],
		levelsByHumanId: new Map(),
		levelsBySlug: new Map(),
	};
	let globalLevelId = 0;
	let globalChapterId = 0;

	for (const chapterFolder of readDirs(LEVELS_DIR)) {
		const chapterPath = path.join(LEVELS_DIR, chapterFolder);
		const [chapterId, chapterName] = chapterFolder.split("_");
		const chapterHumanId = chapterId.replace(/^0+/, "");
		const chapterNumber = Number.parseInt(
			chapterHumanId.replace(/\D/g, ""),
			10
		);
		const isSpecial = Number.isNaN(chapterNumber);
		const chapter = {
			id: isSpecial ? -1 : globalChapterId,
			humanId: chapterHumanId,
			folder: chapterFolder,
			path: chapterPath,
			levels: [],
			isSpecial,
		};

		let localLevelId = 0;
		for (const levelFolder of readDirs(chapterPath)) {
			const levelPath = path.join(chapterPath, levelFolder);
			const [, levelName] = levelFolder.split("_");
			const meta = readJson(path.join(levelPath, "meta.json"));
			const level = {
				id: slug((chapterName + "-" + levelName).replace(/_/g, " ")),
				humanId: `${chapter.humanId}.${localLevelId + 1}`,
				globalId: globalLevelId,
				folder: levelFolder,
				path: levelPath,
				meta,
				chapter,
			};

			chapter.levels.push(level);
			book.levelsByHumanId.set(level.humanId, level);
			book.levelsBySlug.set(level.id, level);
			globalLevelId += 1;
			localLevelId += 1;
		}

		book.chapters.push(chapter);
		if (!isSpecial) globalChapterId += 1;
	}

	book.getId = (humanId) =>
		book.levelsByHumanId.get(humanId)?.globalId ?? Infinity;
	return book;
}

function findLevel(book, levelId) {
	const level =
		book.levelsByHumanId.get(levelId) ?? book.levelsBySlug.get(levelId);
	if (!level) throw new Error(`Unknown level: ${levelId}`);
	return level;
}

function getLevelRange(book, fromLevelId, toLevelId) {
	const toLevel = findLevel(book, toLevelId);
	if (!fromLevelId) return [toLevel];

	const fromLevel = findLevel(book, fromLevelId);
	if (fromLevel.globalId > toLevel.globalId) {
		throw new Error(`--from must point to a level before ${toLevelId}`);
	}

	return book.chapters
		.flatMap((chapter) => chapter.levels)
		.filter(
			(level) =>
				level.globalId >= fromLevel.globalId &&
				level.globalId <= toLevel.globalId
		);
}

function loadLevelAssets(level) {
	const assets = {};
	for (const folder of ["bin", "media", "tests"]) {
		const folderPath = path.join(level.path, folder);
		assets[folder] = {};
		if (!fs.existsSync(folderPath)) continue;
		for (const file of fs.readdirSync(folderPath)) {
			const filePath = path.join(folderPath, file);
			if (!fs.statSync(filePath).isFile()) continue;
			assets[folder][file] = fs.readFileSync(filePath);
			if (isTextFile(file))
				assets[folder][file] = assets[folder][file].toString();
		}
	}
	return assets;
}

function isTextFile(fileName) {
	return /\.(js|json|md|txt|asm|yml|yaml|log|en|es)$/i.test(fileName);
}

function runCopyScript(filesystem, level) {
	const copyPath = path.join(level.path, "code/copy.js");
	if (!fs.existsSync(copyPath)) return;

	const assets = loadLevelAssets(level);
	const context = vm.createContext({
		filesystem,
		Drive: DRIVE,
		level: {
			bin: assets.bin,
			media: assets.media,
			tests: assets.tests,
		},
		console,
	});
	vm.runInContext(fs.readFileSync(copyPath, "utf8"), context, {
		filename: copyPath,
	});
}

function seedFilesystem(filesystem, book, targetLevel) {
	for (const chapter of book.chapters) {
		for (const level of chapter.levels) {
			if (level.globalId > targetLevel.globalId) return;
			runCopyScript(filesystem, level);
		}
	}
}

function copySolution(filesystem, solutionDir, book, level) {
	if (!solutionDir) return;

	const absolute = path.resolve(ROOT, solutionDir);
	const sourceDirs = findSolutionSnapshotDirs(absolute, book, level);
	for (const sourceDir of sourceDirs) {
		copySolutionDir(filesystem, sourceDir);
	}
}

function copySolutionDir(filesystem, sourceDir) {
	const codeRoot = fs.existsSync(path.join(sourceDir, "code"))
		? path.join(sourceDir, "code")
		: sourceDir;
	copyTreeToVirtualFs(filesystem, codeRoot, "/code");

	for (const extra of ["lib", "docs"]) {
		const extraPath = path.join(sourceDir, extra);
		if (fs.existsSync(extraPath))
			copyTreeToVirtualFs(filesystem, extraPath, `/${extra}`);
	}
}

function findSolutionSnapshotDirs(solutionDir, book, targetLevel) {
	const snapshots = book.chapters
		.flatMap((chapter) => chapter.levels)
		.filter((level) => level.globalId <= targetLevel.globalId)
		.map((level) => findExactSolutionSnapshotDir(solutionDir, level))
		.filter(Boolean);

	if (snapshots.length > 0) return snapshots;
	return hasSolutionContent(solutionDir) ? [solutionDir] : [];
}

function findExactSolutionSnapshotDir(solutionDir, level) {
	return [
		path.join(solutionDir, level.humanId),
		path.join(solutionDir, level.id),
		path.join(solutionDir, level.folder),
	].find((candidate) => fs.existsSync(candidate));
}

function hasSolutionContent(solutionDir) {
	if (!fs.existsSync(solutionDir)) return false;
	if (fs.existsSync(path.join(solutionDir, "code"))) return true;
	return fs
		.readdirSync(solutionDir, { withFileTypes: true })
		.some((entry) => entry.isFile() && entry.name.endsWith(".js"));
}

function copyTreeToVirtualFs(filesystem, sourceDir, virtualDir) {
	if (!fs.statSync(sourceDir).isDirectory()) return;
	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.posix.join(virtualDir, entry.name);
		if (entry.isDirectory()) {
			copyTreeToVirtualFs(filesystem, sourcePath, targetPath);
		} else if (entry.isFile()) {
			filesystem.write(targetPath, fs.readFileSync(sourcePath, "utf8"));
		}
	}
}

function createModuleRunner(filesystem) {
	const cache = new Map();
	const reverseCache = new Map();

	async function evaluate(filePath = "/code/index.js") {
		const { moduleUrl, modules } = compile(filePath);
		const loaded = await import(moduleUrl);
		for (const [modulePath, resolvedUrl] of Object.entries(modules)) {
			if (modulePath.endsWith(".js"))
				modules[modulePath.slice(0, -3)] = resolvedUrl;
			else modules[`${modulePath}.js`] = resolvedUrl;
		}
		evaluate.modules = modules;
		return loaded;
	}

	function compile(filePath, modules = {}) {
		const absolutePath = resolveImportPath(filePath, "/");
		if (cache.has(absolutePath)) {
			const cached = cache.get(absolutePath);
			Object.assign(modules, cached.modules ?? {});
			modules[absolutePath] = cached.moduleUrl;
			return { moduleUrl: cached.moduleUrl, modules };
		}

		let content = String(filesystem.read(absolutePath));
		content = rewriteImports(content, absolutePath, modules);
		const moduleUrl = `data:text/javascript;base64,${Buffer.from(
			content
		).toString("base64")}`;
		modules[absolutePath] = moduleUrl;
		cache.set(absolutePath, { moduleUrl, modules: { ...modules } });
		reverseCache.set(moduleUrl, absolutePath);
		return { moduleUrl, modules };
	}

	function rewriteImports(content, filePath, modules) {
		const dir = path.posix.dirname(filePath);
		const importRegex = /^\s*import\s+([\s\S]*?)\s+from\s+["'](.+?)["']\s*;?\s*(?:\/\/.*)?$/gm;

		return content.replace(importRegex, (line, specifier, importPath) => {
			const absolutePath = resolveImportPath(importPath, dir);
			const { moduleUrl } = compile(absolutePath, modules);
			const trimmed = specifier.trim();

			if (/^\w+$/.test(trimmed)) {
				return `const ${trimmed} = (await import("${moduleUrl}")).default;`;
			}
			if (/^\{[\s\S]*\}$/.test(trimmed)) {
				return `const ${trimmed} = await import("${moduleUrl}");`;
			}
			const mixed = trimmed.match(/^(\w+)\s*,\s*(\{[\s\S]*\})$/);
			if (mixed) {
				return [
					`const ${mixed[1]} = (await import("${moduleUrl}")).default;`,
					`const ${mixed[2]} = await import("${moduleUrl}");`,
				].join("\n");
			}

			throw new Error(`Unsupported import in ${filePath}: ${line}`);
		});
	}

	function resolveImportPath(importPath, fromDir) {
		let resolved = importPath.startsWith("/")
			? importPath
			: path.posix.join(fromDir, importPath);
		if (!path.posix.extname(resolved)) resolved += ".js";
		resolved = normalizeVirtualPath(resolved);

		try {
			const stat = filesystem.stat(resolved);
			if (stat.isDirectory) throw new Error("Import resolved to a directory");
		} catch {
			throw new Error(`Import failed: ${importPath} from ${fromDir}`);
		}

		return resolved;
	}

	async function evaluateModule(moduleUrl) {
		return import(moduleUrl);
	}

	function buildStack(error) {
		if (!error?.stack) return null;
		let trace = error.stack;
		for (const [moduleUrl, filePath] of reverseCache.entries()) {
			trace = trace.split(moduleUrl).join(filePath);
		}
		return { trace };
	}

	return { evaluate, evaluateModule, buildStack };
}

class HeadlessEmulatorBuilder {
	constructor(evaluate) {
		this.evaluate = evaluate;
		this.withUserCartridge = false;
		this.withUserCPU = false;
		this.withUserPPU = false;
		this.withUserAPU = false;
		this.withUserController = false;
		this.customPPU = null;
		this.customAPU = null;
		this.omitReset = false;
		this.unbroken = false;
	}

	async build() {
		const mainModule = (await this.evaluate()).default;
		const CPUMemory =
			this.withUserCPU ||
			this.withUserPPU ||
			this.withUserAPU ||
			this.withUserController
				? this.getComponent(mainModule, "CPUMemory")
				: undefined;
		const Cartridge = this.withUserCartridge
			? this.getComponent(mainModule, "Cartridge")
			: undefined;
		const CPU = this.withUserCPU
			? this.getComponent(mainModule, "CPU")
			: undefined;
		const PPU = this.withUserPPU
			? this.getComponent(mainModule, "PPU")
			: undefined;
		const APU = this.withUserAPU
			? this.getComponent(mainModule, "APU")
			: undefined;
		const Controller = this.withUserController
			? this.getComponent(mainModule, "Controller")
			: undefined;

		return BrokenNEEES({
			CPUMemory,
			Cartridge,
			CPU,
			PPU: this.customPPU ?? PPU,
			APU: this.customAPU ?? APU,
			Controller,
			omitReset: this.omitReset,
			unbroken: this.unbroken,
		});
	}

	addUserCartridge(add = true) {
		this.withUserCartridge = add;
		return this;
	}

	addUserCPU(add = true, omitReset = false) {
		this.withUserCPU = add;
		this.omitReset = omitReset;
		return this;
	}

	addUserPPU(add = true) {
		this.withUserPPU = add;
		return this;
	}

	addUserAPU(add = true) {
		this.withUserAPU = add;
		return this;
	}

	addUserController(add = true) {
		this.withUserController = add;
		return this;
	}

	usePartialPPU() {
		return this;
	}

	usePartialAPU() {
		return this;
	}

	setCustomPPU(customPPU = null) {
		this.customPPU = customPPU;
		return this;
	}

	setCustomAPU(customAPU = null) {
		this.customAPU = customAPU;
		return this;
	}

	setUnbroken(unbroken = false) {
		this.unbroken = unbroken;
		return this;
	}

	setHardware() {
		return this;
	}

	useCustomEmulator() {
		throw new Error(
			"Custom emulator mode is not supported by the headless CLI"
		);
	}

	getComponent(mainModule, componentName) {
		const component = mainModule[componentName];
		if (component == null) throw new Error(`\`${componentName}\` not found`);
		return component;
	}
}

function createTestHelpers() {
	function newHeader(prgPages = 1, chrPages = 1, flags6 = 0, flags7 = 0) {
		return [
			0x4e,
			0x45,
			0x53,
			0x1a,
			prgPages,
			chrPages,
			flags6,
			flags7,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
		];
	}

	function newRom(prgBytes = [], header = newHeader()) {
		const prg = prgBytes;
		const chr = [];
		for (let i = prgBytes.length; i < 16384; i += 1) prg.push(0);
		for (let i = 0; i < 8192; i += 1) chr.push(byte.random());
		return new Uint8Array([...header, ...prg, ...chr]);
	}

	function toHex(n, length = 4) {
		return `0x${n.toString(16).padStart(length, "0")}`;
	}

	return { newHeader, newRom, toHex };
}

function createAsmContext(level, filesystem) {
	const code = filesystem.exists("/code/content.asm")
		? filesystem.read("/code/content.asm")
		: readLevelCode(level, "content.asm") ?? "";
	const preCodeFile =
		level.meta.test?.precode ??
		(readLevelCode(level, "pretest.asm") == null ? null : "pretest.asm");
	const preCode =
		preCodeFile == null ? null : readLevelCode(level, preCodeFile);

	return {
		code,
		compile() {
			return createAsmRunner(code, preCode);
		},
	};
}

function readLevelCode(level, fileName) {
	const filePath = path.join(level.path, "code", fileName);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath, "utf8");
}

function createAsmRunner(code, preCode = null) {
	const { instructions, bytes } = compileAsm(code);
	const cpu = new NES().cpu;

	const memory = {
		bytes: new Uint8Array(0xffff + 1),
		readAt(address) {
			return this.bytes[address] || 0;
		},
		readBytesAt(address, n) {
			return n === 2 ? this.read2BytesAt(address) : this.readAt(address);
		},
		read2BytesAt(address) {
			return (this.readAt(address + 1) << 8) | this.readAt(address);
		},
		writeAt(address, byteValue) {
			if (address >= 0 && address <= 0xffff) this.bytes[address] = byteValue;
		},
	};
	const context = {
		cpu,
		memoryBus: { cpu: memory },
	};

	cpu.memory = memory;
	cpu.context = context;
	cpu.stack.context = context;
	cpu.pc.value = ASM_CODE_ADDRESS;
	cpu.sp.value = 0xff;

	if (preCode != null) {
		try {
			const preCpu = createAsmRunner(preCode).cpu;
			let randomByte = Math.floor(Math.random() * 255);
			if (randomByte === 7) randomByte++;
			preCpu.memory.writeAt(0x4000, Math.random() < 0.5 ? 7 : randomByte);
			preCpu.memory.writeAt(0x4001, Math.floor(Math.random() * 255));
			preCpu.memory.writeAt(0x4002, Math.floor(Math.random() * 255));
			preCpu.run();
			for (let i = 0; i < 0xffff; i += 1)
				cpu.memory.writeAt(i, preCpu.memory.readAt(i));
			cpu.sp.value = preCpu.sp.value;
		} catch {
			throw new Error("Pre-code failed!");
		}
	}

	bytes.forEach((byteValue, i) =>
		memory.writeAt(ASM_CODE_ADDRESS + i, byteValue)
	);

	cpu.run = () => {
		const startTime = Date.now();

		while (true) {
			cpu.step();

			const lineIndex = instructions.find(
				(it) => ASM_CODE_ADDRESS + it.address === cpu.pc.value
			)?.lineIndex;

			if (!lineIndex) break;
			if (Date.now() - startTime > ASM_TIMEOUT)
				throw new Error("Execution timed out (infinite loop?)");
		}
	};

	return { instructions, bytes, cpu };
}

function compileAsm(asm) {
	const root = parseAsm(asm);
	const lir = assemble(root);

	const instructions = [];
	let byteOffset = 0;
	lir.forEach((entry) => {
		if (entry instanceof Instruction) {
			instructions.push({
				address: byteOffset,
				line: entry.source,
				lineIndex: entry.line.lineNumber - 1,
				size: entry.bytes.length,
			});
			byteOffset += entry.bytes.length;
		}
	});

	const hex = [];
	const nonLabels = lir.filter(
		(entry) => entry instanceof Instruction || entry instanceof Uint8Array
	);
	nonLabels.forEach((entry) => {
		if (!entry.bytes || entry.bytes.length === 0) {
			const { lineNumber } = entry.line;
			const { source } = entry;
			throw new Error(
				`Assembly Error: Unable to generate hex for line ${lineNumber} "${source}".`
			);
		}
		for (const byteValue of entry._bytes) hex.push(byteValue);
	});

	return { bytes: new Uint8Array(hex), instructions };
}

function parseAsm(source) {
	const parsed = [];
	const lines = source
		.split("\n")
		.map(
			(sourceLine, index) =>
				new ParseLine({
					original: `${sourceLine}\n`,
					lineNumber: index + 1,
					assembly: sourceLine
						.replace(/^\s+/, "")
						.replace(/;.*/, "")
						.replace(/\s+$/, ""),
				})
		)
		.filter((line) => line.assembly.length > 0);

	for (const line of lines) {
		try {
			const node = lineParser.parse(line.assembly);
			if (Array.isArray(node)) {
				node.forEach((child) => {
					child.line = line;
					setAsmNodeLine(line, child);
					parsed.push(child);
				});
			} else {
				setAsmNodeLine(line, node);
				parsed.push(node);
			}
		} catch (error) {
			const parserError = new ParseError(error, line);
			parserError.err = error;
			parserError.lineNumber = line.lineNumber;
			throw parserError;
		}
	}

	return ParseNode.statementList(parsed);
}

function setAsmNodeLine(line, node) {
	node.line = line;
	node.children.forEach((child) => setAsmNodeLine(line, child));
}

function installChaiExtensions() {
	if (chaiExtensionsInstalled) return;
	chaiExtensionsInstalled = true;
	chai.use(sinonChai);

	function isClass(v) {
		return typeof v === "function" && /^\s*class\s+/.test(v.toString());
	}

	chai.Assertion.addProperty("class", function () {
		const obj = this._obj;
		this.assert(
			isClass(obj),
			"expected #{this} to be a class",
			"expected #{this} to not be a class",
			"class",
			typeof obj
		);
	});

	chai.Assertion.addChainableMethod("equalN", function (expected, name) {
		const actual = this._obj;
		this.assert(
			actual === expected,
			`expected ${name} to equal ${expected}, but got ${actual}`,
			`expected ${name} not to equal ${expected}`
		);
	});

	chai.Assertion.addChainableMethod("eqNoCase", function (expected, name) {
		const expectedUpperCase = expected.toUpperCase();
		const actualUpperCase = this._obj?.toUpperCase?.() ?? this._obj;
		this.assert(
			actualUpperCase === expectedUpperCase,
			`expected ${name} to equal ${expected}, but got ${this._obj}`,
			`expected ${name} not to equal ${expected}`
		);
	});

	const toHex = (x) =>
		_.isFinite(x) ? `0x${x.toString(16).toUpperCase()}` : x;
	chai.Assertion.addChainableMethod("equalHex", function (expected, name) {
		const actual = this._obj;
		this.assert(
			actual === expected,
			`expected ${name} to equal ${toHex(expected)}, but got ${toHex(actual)}`,
			`expected ${name} not to equal ${toHex(expected)}`
		);
	});

	const toBin = (x) =>
		_.isFinite(x) ? `0b${x.toString(2).padStart(8, "0")}` : x;
	chai.Assertion.addChainableMethod("equalBin", function (expected, name) {
		const actual = this._obj;
		this.assert(
			actual === expected,
			`expected ${name} to equal ${toBin(expected)}, but got ${toBin(actual)}`,
			`expected ${name} not to equal ${toBin(expected)}`
		);
	});
}

function getInheritedTests(level) {
	const inherit = level.meta.test?.inherit ?? [];
	const globalTests = fs.readdirSync(GLOBAL_TESTS_DIR);

	return inherit.flatMap((fileName) => {
		if (!fileName.endsWith("*")) return [fileName];
		const prefix = fileName.slice(0, -1);
		return globalTests.filter((it) => it.startsWith(prefix));
	});
}

function getLevelTestSources(level) {
	const sources = getInheritedTests(level).map((fileName) => ({
		fileName,
		path: path.join(GLOBAL_TESTS_DIR, fileName),
	}));
	const localTestsDir = path.join(level.path, "tests");

	if (fs.existsSync(localTestsDir)) {
		for (const fileName of fs.readdirSync(localTestsDir).sort()) {
			if (!fileName.endsWith(".js")) continue;
			sources.push({
				fileName,
				path: path.join(localTestsDir, fileName),
			});
		}
	}

	return sources;
}

function buildTestDefinition(code, $, book, level, idProvider) {
	let beforeRun = null;
	let beforeEachRun = null;
	let afterEachRun = null;
	let afterRun = null;
	const tests = [];
	code = normalizeCrossRealmRegexArguments(code);
	code = normalizeShouldEqualAssertions(code);

	const context = vm.createContext({
		$,
		before(run) {
			beforeRun = run;
		},
		beforeEach(run) {
			beforeEachRun = run;
		},
		afterEach(run) {
			afterEachRun = run;
		},
		after(run) {
			afterRun = run;
		},
		it(name, test) {
			const testDefinition = { id: ++idProvider.id, name, test };
			tests.push(testDefinition);
			return (options = {}) => {
				testDefinition.name = options.locales?.en || name;
				if (options.use && !options.use({ id: level.globalId }, book))
					tests.pop();
			};
		},
		expect: chai.expect,
		should: chai.should(),
		sinon,
		Error,
		RegExp,
		evaluateModule: $.evaluateModule,
		GLOBAL_LEVEL_ID: level.globalId,
		Math: createDeterministicMath(),
		console,
	});

	vm.runInContext(code, context);
	return { beforeRun, beforeEachRun, afterEachRun, afterRun, tests };
}

function createDeterministicMath() {
	const math = Object.create(Math);
	math.random = () => 0.25;
	return math;
}

function normalizeCrossRealmRegexArguments(code) {
	return code.replace(
		/\.to\.throw\(\s*([^,\n]+?)\s*,\s*\/((?:\\\/|[^/])+)\/([a-z]*)\s*\)/g,
		(_match, errorClass, source, flags) =>
			`.to.throw(${errorClass.trim()}, new RegExp(${JSON.stringify(
				source
			)}, ${JSON.stringify(flags)}))`
	);
}

function normalizeShouldEqualAssertions(code) {
	return code.replace(
		/^(\s*)(.+?)\.should\.equal\((.+)\);$/gm,
		(_match, indent, actual, args) =>
			`${indent}expect(${actual}).to.equal(${args});`
	);
}

async function runTests(testFiles, buildStack) {
	const results = [];

	for (const testFile of testFiles) {
		let didBeforeRun = false;
		let didAfterRun = false;

		for (const definition of testFile.tests) {
			try {
				if (!didBeforeRun && testFile.beforeRun) {
					await testFile.beforeRun();
					didBeforeRun = true;
				}
				if (testFile.beforeEachRun) await testFile.beforeEachRun();
				await definition.test();
				if (testFile.afterEachRun) await testFile.afterEachRun();
				if (!didAfterRun && testFile.afterRun) {
					await testFile.afterRun();
					didAfterRun = true;
				}
				results.push({
					id: definition.id,
					fileName: testFile.fileName,
					name: definition.name,
					passed: true,
				});
			} catch (error) {
				results.push({
					id: definition.id,
					fileName: testFile.fileName,
					name: definition.name,
					passed: false,
					reason: error?.message ?? String(error),
					fullStack: buildStack(error),
				});
			}
		}
	}

	return _.orderBy(results, "passed", "desc");
}

async function runLevel({ book, level, solutionDir }) {
	const filesystem = new VirtualFilesystem();
	seedFilesystem(filesystem, book, level);
	copySolution(filesystem, solutionDir, book, level);

	const moduleRunner = createModuleRunner(filesystem);
	const $ =
		level.meta.test?.context === "asm"
			? createAsmContext(level, filesystem)
			: {};
	Object.assign($, {
		modules: null,
		EmulatorBuilder: class extends HeadlessEmulatorBuilder {
			constructor() {
				super(moduleRunner.evaluate);
			}
		},
		testHelpers: createTestHelpers(),
		filesystem,
		byte,
		lodash: _,
		evaluate: async (filePath = "/code/index.js") => {
			const result = await moduleRunner.evaluate(filePath);
			$.modules = moduleRunner.evaluate.modules;
			return result;
		},
		evaluateModule: moduleRunner.evaluateModule,
	});

	const idProvider = { id: 0 };
	const testFiles = [];
	for (const testFile of getLevelTestSources(level)) {
		const code = fs.readFileSync(testFile.path, "utf8");
		const definition = buildTestDefinition(code, $, book, level, idProvider);
		if (definition.tests.length > 0) {
			testFiles.push({
				fileName: testFile.fileName,
				tests: definition.tests,
				beforeRun: definition.beforeRun,
				beforeEachRun: definition.beforeEachRun,
				afterEachRun: definition.afterEachRun,
				afterRun: definition.afterRun,
			});
		}
	}

	const results = await runTests(testFiles, moduleRunner.buildStack);
	const failed = results.filter((it) => !it.passed);
	const passed = results.length - failed.length;
	const summary = {
		level: {
			id: level.id,
			humanId: level.humanId,
			globalId: level.globalId,
		},
		summary: { passed, failed: failed.length, total: results.length },
		results,
	};

	return summary;
}

function printLevelSummary(levelSummary) {
	const failed = levelSummary.results.filter((it) => !it.passed);
	const { level, summary } = levelSummary;

	console.log(
		`${level.humanId} ${level.id}: ${summary.passed}/${summary.total} passed`
	);
	for (const failure of failed.slice(0, 5)) {
		console.log(`\nFAIL #${failure.id} (${failure.fileName}): ${failure.name}`);
		console.log(failure.reason);
	}
}

function summarizeRun(levelSummaries) {
	return levelSummaries.reduce(
		(acc, levelSummary) => {
			acc.passed += levelSummary.summary.passed;
			acc.failed += levelSummary.summary.failed;
			acc.total += levelSummary.summary.total;
			return acc;
		},
		{ passed: 0, failed: 0, total: 0 }
	);
}

async function runCommand(options) {
	installChaiExtensions();
	const book = buildBook();
	const levels = getLevelRange(book, options.fromLevelId, options.levelId);
	const levelSummaries = [];

	for (const level of levels) {
		levelSummaries.push(
			await runLevel({
				book,
				level,
				solutionDir: options.solutionDir,
			})
		);
	}

	const summary = summarizeRun(levelSummaries);
	if (options.json) {
		console.log(JSON.stringify({ summary, levels: levelSummaries }, null, 2));
	} else {
		for (const levelSummary of levelSummaries) {
			printLevelSummary(levelSummary);
			console.log("");
		}
		if (levelSummaries.length > 1) {
			console.log(
				`Total: ${summary.passed}/${summary.total} passed across ${levelSummaries.length} levels`
			);
		}
	}

	return summary.failed === 0 ? 0 : 1;
}

async function checkSavePackage(filePath) {
	const data = fs.readFileSync(path.resolve(ROOT, filePath));
	const zip = await JSZip.loadAsync(data);
	const localStorageFile = zip.file(SAVE_LOCALSTORAGE_FILE);
	if (!localStorageFile) throw new Error("Missing localstorage.json");

	const localStorage = await localStorageFile.async("string");
	if (!_.isObject(JSON.parse(localStorage))) {
		throw new Error("Invalid localstorage.json");
	}

	const prefix = `${SAVE_INDEXED_DB_FOLDER}/`;
	const indexedDbFiles = Object.keys(zip.files).filter(
		(file) => file !== prefix && file.startsWith(prefix) && !zip.files[file].dir
	);
	if (indexedDbFiles.length === 0) {
		throw new Error("Missing IndexedDB entries");
	}

	for (const file of indexedDbFiles) {
		Buffer.from(file.slice(prefix.length), "base64").toString("utf8");
	}

	return {
		localStorageBytes: Buffer.byteLength(localStorage),
		indexedDbEntries: indexedDbFiles.length,
	};
}

async function restoreSavePackage(filePath, targetDir, force = false) {
	if (!targetDir) throw new Error("Missing --to <dir>");
	const absoluteTarget = path.resolve(ROOT, targetDir);
	if (fs.existsSync(absoluteTarget)) {
		const entries = fs.readdirSync(absoluteTarget);
		if (entries.length > 0 && !force) {
			throw new Error(`Target directory is not empty: ${absoluteTarget}`);
		}
		if (force) clearDirectory(absoluteTarget);
	} else {
		fs.mkdirSync(absoluteTarget, { recursive: true });
	}

	const data = fs.readFileSync(path.resolve(ROOT, filePath));
	const zip = await JSZip.loadAsync(data);
	await checkSavePackage(filePath);

	for (const [zipPath, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue;
		const targetPath = path.resolve(absoluteTarget, zipPath);
		if (!targetPath.startsWith(`${absoluteTarget}${path.sep}`)) {
			throw new Error(`Unsafe save package path: ${zipPath}`);
		}
		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		fs.writeFileSync(targetPath, Buffer.from(await entry.async("uint8array")));
	}

	return absoluteTarget;
}

async function backupSavePackage(sourceDir, filePath) {
	if (!filePath) throw new Error("Missing --to <file>");
	const absoluteSource = path.resolve(ROOT, sourceDir);
	if (!fs.statSync(absoluteSource).isDirectory()) {
		throw new Error(`Source directory not found: ${absoluteSource}`);
	}

	const zip = new JSZip();
	addDirectoryToZip(zip, absoluteSource, "");
	const content = await zip.generateAsync({ type: "nodebuffer" });
	const absoluteFile = path.resolve(ROOT, filePath);
	fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
	fs.writeFileSync(absoluteFile, content);
	await checkSavePackage(absoluteFile);
	return absoluteFile;
}

function resetSavePackageDir(targetDir, force = false) {
	if (!targetDir) throw new Error("Missing --to <dir>");
	const absoluteTarget = path.resolve(ROOT, targetDir);
	if (!force) throw new Error("Refusing to reset without --force");
	if (!fs.existsSync(absoluteTarget)) return absoluteTarget;
	clearDirectory(absoluteTarget);
	return absoluteTarget;
}

function clearDirectory(dir) {
	for (const entry of fs.readdirSync(dir)) {
		fs.rmSync(path.join(dir, entry), {
			force: true,
			recursive: true,
		});
	}
}

function addDirectoryToZip(zip, sourceDir, prefix) {
	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDir, entry.name);
		const zipPath = path.posix.join(prefix, entry.name);
		if (entry.isDirectory()) {
			addDirectoryToZip(zip, sourcePath, zipPath);
		} else if (entry.isFile()) {
			zip.file(zipPath, fs.readFileSync(sourcePath));
		}
	}
}

async function runSaveCommand(options) {
	if (options.saveCommand === "check") {
		const result = await checkSavePackage(options.saveSubject);
		console.log(
			`OK: ${result.indexedDbEntries} IndexedDB entr${
				result.indexedDbEntries === 1 ? "y" : "ies"
			}, ${result.localStorageBytes} localStorage bytes`
		);
		return 0;
	}

	if (options.saveCommand === "restore") {
		const target = await restoreSavePackage(
			options.saveSubject,
			options.to,
			options.force
		);
		console.log(`Restored save package to ${target}`);
		return 0;
	}

	if (options.saveCommand === "backup") {
		const target = await backupSavePackage(options.saveSubject, options.to);
		console.log(`Created save package ${target}`);
		return 0;
	}

	if (options.saveCommand === "reset") {
		const target = resetSavePackageDir(
			options.to ?? options.saveSubject,
			options.force
		);
		console.log(`Reset save package directory ${target}`);
		return 0;
	}

	printUsage();
	return 1;
}

function printUsage() {
	console.log(`Usage:
  npm run cli -- test <level> [--from <level>] [--solution-dir <dir>] [--json]
  npm run cli -- save check <file.devz>
  npm run cli -- save restore <file.devz> --to <dir> [--force]
  npm run cli -- save backup <dir> --to <file.devz>
  npm run cli -- save reset <dir> --force

Why:
  Run existing EmuDevz level tests headlessly for repeatable checks, CI, or
  external benchmarks without driving the game UI. Save commands operate on
  .devz packages and unpacked package directories, not live browser storage.

Examples:
  npm run cli -- test 1.1
  npm run cli -- test 5a.16 --solution-dir ./solutions/cpu
  npm run cli -- test 5a.16 --from 5a.1 --solution-dir ./solutions/cpu
  node ./bin/emudevz-cli.mjs test cpu-the-golden-log --json
  npm run --silent cli -- test 5a.16 --json
  npm run cli -- save check ./backup.devz
  npm run cli -- save restore ./backup.devz --to ./save-package
  npm run cli -- save backup ./save-package --to ./backup-copy.devz

When --solution-dir contains per-level snapshots named like "5a.1" or
"cpu-new-cpu", snapshots up to the tested level are layered in order.

See BENCHMARK.md for snapshot layout and benchmark guidelines.`);
}

function parseArgs(argv) {
	const [command, subject, ...rest] = argv;
	const options = {
		command,
		levelId: command === "test" ? subject : null,
		saveCommand: command === "save" ? subject : null,
		saveSubject: null,
		fromLevelId: null,
		solutionDir: null,
		to: null,
		force: false,
		json: false,
	};

	if (command === "save") options.saveSubject = rest.shift() ?? null;

	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i];
		if (arg === "--solution-dir") {
			options.solutionDir = rest[++i];
		} else if (arg === "--from") {
			options.fromLevelId = rest[++i];
		} else if (arg === "--to") {
			options.to = rest[++i];
		} else if (arg === "--force") {
			options.force = true;
		} else if (arg === "--json") {
			options.json = true;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return options;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (
		!options.command ||
		options.command === "--help" ||
		options.command === "-h"
	) {
		printUsage();
		return 0;
	}

	if (options.command === "test" && options.levelId) return runCommand(options);
	if (options.command === "save" && options.saveCommand) {
		return runSaveCommand(options);
	}

	printUsage();
	return 1;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error) => {
		console.error(error?.stack ?? error?.message ?? String(error));
		process.exitCode = 1;
	});
