"use strict";

const new_node = require("./node");
const {replace_all} = require("./utils");

function apply_komi_fix(root) {

	let km = parseFloat(root.get("KM"));
	if (Number.isNaN(km)) {
		root.delete_key("KM");
		return;									// Just bail out if we weren't given a valid KM.
	}

	let ha = parseInt(root.get("HA"), 10);		// Might be NaN, we don't care.

	// Specific Fox fixes for the strangely common case where it specifies KM[0] and HA[0]
	// but there really was a komi... I believe Fox specifies HA[1] if there's genuinely
	// no komi, so the following is "safe" I think...

	if (root.all_values("AP").includes("foxwq") && km === 0 && ha === 0) {
		if (["chinese", "cn"].includes(root.get("RU").toLowerCase())) {
			km = 7.5;
		} else {
			km = 6.5;
		}
	}

	// Some sources seem to multiply komi by 100...

	if (km > 150) {
		km /= 100;
	}

	// Some files give komi in Chinese format e.g. 3.75...

	if (km - Math.floor(km) === 0.75 || km - Math.floor(km) === 0.25) {
		km *= 2;
	}

	root.set("KM", km);
}

function apply_pl_fix(root) {

	// Find the node with the first real move (B or W tag).
	// If it's not made by the natural player -- as defined by node.natural_active() -- then set a PL tag in its parent.

	let node = root;

	while (node) {
		if (node.has_key("B")) {
			if (node.parent && node.parent.natural_active() !== "b") {
				node.parent.set("PL", "B");
			}
			return;
		}
		if (node.has_key("W")) {
			if (node.parent && node.parent.natural_active() !== "w") {
				node.parent.set("PL", "W");
			}
			return;
		}
		node = node.children[0];		// Possibly undefined.
	}
}

function apply_ruleset_fixes(root) {

	if (!root.has_key("RU")) {
		return;
	}

	const altdict = {
		"Chinese": ["chinese", "cn"],
		"Japanese": ["japanese", "jp"],
		"Korean": ["korean", "kr"],
		"AGA": ["aga", "bga", "french"],
		"New Zealand": ["new zealand", "nz"],
		"Tromp Taylor": ["tromp taylor", "tromp-taylor"],
	};

	let rules = root.get("RU").toLowerCase();

	for (let [main, alts] of Object.entries(altdict)) {
		if (alts.includes(rules)) {
			root.set("RU", main);
			return;
		}
	}
}

function purge_newlines(root) {

	// It's obnoxious for most important root properties to possess newlines...

	for (let key of ["RU", "PB", "BR", "PW", "WR", "EV", "RO", "GN", "PC", "DT", "RE"]) {
		if (root.has_key(key)) {
			let val = root.get(key);
			val = replace_all(val, "\r\n", " ");
			val = replace_all(val, "\r", " ");
			val = replace_all(val, "\n", " ");
			root.set(key, val);
		}
	}
}

function advance_depth_1_setup(root) {

	for (let key of ["AB", "AW", "AE", "B", "W"]) {
		if (root.has_key(key)) {
			return false;
		}
	}
	if (root.children.length !== 1) {
		return false;
	}
	let child = root.children[0];
	if (!child.has_key("AB") && !child.has_key("AW")) {
		return false;
	}
	for (let key of ["B", "W"]) {
		if (child.has_key(key)) {
			return false;
		}
	}
	let grandchildren = child.children;
	if (grandchildren.length === 0) {
		return false;
	}
	for (let gc of grandchildren) {
		if (gc.has_key("AW") || gc.has_key("AB") || gc.has_key("AE")) {
			return false;
		}
	}

	// We're doing it...

	root.delete_key("PL");

	root.children = grandchildren;
	for (let gc of grandchildren) {
		gc.parent = root;
	}

	for (let key of child.all_keys()) {
		if (!root.has_key(key)) {
			for (let value of child.all_values(key)) {
				root.add_value(key, value);
			}
		}
	}

	child.children = [];
	child.detach();

	return true;
}

function fix_singleton_handicap(root) {

	if (root.all_values("AB").length !== 1) {
		return;
	}

	if (root.has_key("AW") || root.has_key("AE") || root.has_key("B") || root.has_key("W")) {
		return;
	}
	if (root.children.length === 0) {
		return;
	}
	for (let child of root.children) {
		if (!child.has_key("W") || child.has_key("B") || child.has_key("AB") || child.has_key("AW") || child.has_key("AE")) {
			return;
		}
	}

	root.set("B", root.get("AB"));
	root.delete_key("AB");
}

function delay_root_move(root) {
	if (root.move_count() !== 1) {
		return false;
	}
	for (let key of ["AB", "AW", "AE"]) {
		if (root.has_key(key)) {
			return false;
		}
	}
	let orig_children = root.children;
	root.children = [];
	let inserted_node = new_node(root);
	inserted_node.children = orig_children;
	for (let child of orig_children) {
		child.parent = inserted_node;
	}
	for (let key of ["B", "CR", "LB", "MA", "PL", "SQ", "TR", "W"]) {
		if (root.has_key(key)) {
			for (let value of root.all_values(key)) {
				inserted_node.add_value(key, value);
			}
			root.delete_key(key);
		}
	}
	return true;
}

function apply_ruleset_guess(root) {
	if (!root.has_key("RU")) {
		if (root.get("KM").startsWith("7.5")) root.set("RU", "Chinese");
		if (root.get("KM").startsWith("6.5")) root.set("RU", "Japanese");
	}
}

function apply_all_fixes(root, guess_ruleset) {

	// These fixes are appled on load, but note that the app can still
	// create trees with these problems through various means, so don't
	// assume the tree is never in such a state...

	let dep1, dep2;							// Whether we did something that messes with depths

	apply_komi_fix(root);
	apply_ruleset_fixes(root);

	dep1 = advance_depth_1_setup(root);		// Pulls all properties from child to root (if it acts at all, which it mostly won't)

	purge_newlines(root);					// After advance_depth_1_setup()
	fix_singleton_handicap(root);			// After advance_depth_1_setup()

	dep2 = delay_root_move(root);			// After fix_singleton_handicap()

	apply_pl_fix(root);						// After delay_root_move()

	if (guess_ruleset) {
		apply_ruleset_guess(root);			// After apply_komi_fix()
	}

	if (dep1 || dep2) {
		root.fix_tree_depths();
	}
}


module.exports = apply_all_fixes;
