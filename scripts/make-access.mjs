#!/usr/bin/env node
/* 처음 쓸 비밀번호를 무작위로 만들어 access.json(해시)과 .local/초기비밀번호.txt(원문)에 저장.
   이후 변경은 앱의 관리자 모드에서 한다. .local/ 은 저장소에 올라가지 않는다. */
import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITER = 600_000;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const newPw = () => Array.from({ length: 12 }, () => CHARS[randomInt(CHARS.length)]).join("");
const entry = pw => {
  const salt = randomBytes(16);
  return { salt: salt.toString("hex"), hash: pbkdf2Sync(pw, salt, ITER, 32, "sha256").toString("hex") };
};

const admin = newPw(), viewer = newPw();
writeFileSync(join(ROOT, "access.json"), JSON.stringify({ v: 1, iter: ITER, admin: entry(admin), viewer: entry(viewer) }, null, 2) + "\n");
mkdirSync(join(ROOT, ".local"), { recursive: true });
writeFileSync(join(ROOT, ".local", "초기비밀번호.txt"), `관리자: ${admin}\n이용자: ${viewer}\n`);
console.log("access.json 과 .local/초기비밀번호.txt 를 만들었습니다.");
