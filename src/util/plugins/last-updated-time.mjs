import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

// Last commit time of the file, falling back to its mtime when it has no
// git history (uncommitted file, shallow clone, or git unavailable).
const getLastUpdated = filepath => {
	try {
		const result = execFileSync("git", ["log", "-1", "--pretty=format:%cI", "--", filepath], {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();

		if (result) return result;
	} catch {}

	return statSync(filepath).mtime.toISOString();
};

const remarkLastUpdatedTime = () => {
	return (_tree, file) => {
		file.data.astro.frontmatter.lastUpdated = getLastUpdated(file.history[0]);
	};
};

export default remarkLastUpdatedTime;
