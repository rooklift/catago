"use strict";

const new_load_results = require("./loader_results");
const new_node = require("./node");
const split_buffer = require("./split_buffer");
const {handicap_stones, replace_all, xy_to_s} = require("./utils");

function load_gib(buf) {

	let ret = new_load_results();
	let lines = split_buffer(buf);

	let root = new_node(null);
	let node = root;

	root.set("GM", 1);
	root.set("FF", 4);
	root.set("CA", "UTF-8");
	root.set("RU", "Korean");

	for (let line of lines) {

		line = line.toString().trim();				// By default, Buffer toString() decodes as if the buffer is UTF-8 (which it maybe isn't, meh).

		// Game info...

		if (line.startsWith("\\[GAMETAG=")) {

			let [dt, re, km, pb, pw] = parse_gib_gametag(line);

			if (dt) root.set("DT", dt);
			if (re) root.set("RE", re);
			if (km) root.set("KM", km);

			if (pb && !pb.includes("�")) root.set("PB", pb);
			if (pw && !pw.includes("�")) root.set("PW", pw);
		}

		// Split the line into tokens for the handicap and move parsing...

		let fields = line.split(" ").filter(z => z !== "");

		// Handicap...

		if (fields.length >= 4 && fields[0] === "INI") {

			if (node != root) {
				ret.add_errors("GIB load error: got INI after moves were made");
				return ret;
			}

			let handicap = parseInt(fields[3], 10);

			if (!Number.isNaN(handicap) && handicap > 1) {
				root.set("HA", handicap);
				for (let s of handicap_stones(handicap, 19, 19, true)) {
					root.add_value("AB", s);
				}
			}
		}

		// Moves...

		if (fields.length >= 6 && fields[0] === "STO") {

			let x = parseInt(fields[4], 10);
			let y = parseInt(fields[5], 10);

			if (!Number.isNaN(x) && !Number.isNaN(y)) {
				let key = fields[3] === "2" ? "W" : "B";
				node = new_node(node);
				node.set(key, xy_to_s(x, y));
			}
		}
	}

	if (root.children.length === 0) {
		ret.add_errors("GIB load error: got no moves");
		return ret;
	}

	ret.add_roots(root);
	return ret;
}

function parse_gib_gametag(line) {

	let fields = line.split(",").map(z => z.trim());

	let dt = "";
	let re = "";
	let km = "";
	let pb = "";
	let pw = "";

	let zipsu = 0;

	for (let s of fields) {

		if (s.length < 2) {
			continue;
		}

		if (s.slice(0, 2) === "A:") {
			pw = s.slice(2);
		}

		if (s.slice(0, 2) === "B:") {
			pb = s.slice(2);
		}

		if (s[0] === "C") {
			dt = s.slice(1);
			if (dt.length > 10) {
				dt = dt.slice(0, 10);
			}
			dt = replace_all(dt, ":", "-");
		}

		if (s[0] === "W") {

			let grlt = parseInt(s.slice(1), 10);

			if (!Number.isNaN(grlt)) {

				switch (grlt) {

				case 0:
					re = "B+";
					break;
				case 1:
					re = "W+";
					break;
				case 3:
					re = "B+R";
					break;
				case 4:
					re = "W+R";
					break;
				case 7:
					re = "B+T";
					break;
				case 8:
					re = "W+T";
					break;
				}
			}
		}

		if (s[0] === "G") {
			let gongje = parseInt(s.slice(1), 10);
			if (!Number.isNaN(gongje)) {
				km = (gongje / 10).toString();
			}
		}

		if (s[0] === "Z") {
			zipsu = parseInt(s.slice(1), 10);
			if (Number.isNaN(zipsu)) {
				zipsu = 0;
			}
		}
	}

	if (re === "B+" || re === "W+") {
		if (zipsu > 0) {
			re += (zipsu / 10).toString();
		}
	}

	return [dt, re, km, pb, pw];
}



module.exports = load_gib;
