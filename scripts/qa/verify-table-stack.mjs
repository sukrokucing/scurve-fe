import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const TABLE_PRIMITIVE_PATH = "src/components/ui/table.tsx";
const TABLE_IMPORT_PATTERN = /from\s+["']@\/components\/ui\/table["']/;
const RAW_TABLE_TAG_PATTERN = /<table[\s>]/;
const TANSTACK_USAGE_PATTERN = /\buseReactTable\s*\(/;
const SHARED_APP_TABLE_PATTERN = /\bAppDataTable\b/;

function collectSourceFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            files.push(...collectSourceFiles(fullPath));
            continue;
        }
        if (/\.(tsx|ts)$/.test(entry)) {
            files.push(fullPath);
        }
    }
    return files;
}

const sourceFiles = collectSourceFiles(SRC_DIR);
const violations = [];

for (const filePath of sourceFiles) {
    const relativePath = filePath.replace(`${ROOT}\\`, "").replaceAll("\\", "/");
    const content = readFileSync(filePath, "utf8");

    if (relativePath !== TABLE_PRIMITIVE_PATH && RAW_TABLE_TAG_PATTERN.test(content)) {
        violations.push(`[raw-table] ${relativePath} contains a raw <table> tag.`);
    }

    if (TABLE_IMPORT_PATTERN.test(content)) {
        const hasTanstack = TANSTACK_USAGE_PATTERN.test(content);
        const usesSharedTable = SHARED_APP_TABLE_PATTERN.test(content);
        if (!hasTanstack && !usesSharedTable) {
            violations.push(`[table-stack] ${relativePath} imports ui/table but does not use TanStack row model (directly or via AppDataTable).`);
        }
    }
}

if (violations.length > 0) {
    console.error("Table stack verification failed:");
    for (const violation of violations) {
        console.error(` - ${violation}`);
    }
    process.exit(1);
}

console.log("Table stack verification passed.");
