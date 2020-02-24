# https://tech.davis-hansson.com/p/make/

SHELL := bash
.ONESHELL:
SHELLFLAGS := -euo pipefail -O globstar -c
MAKEFLAGS += --warn-undefined-variables

.PHONY: build
build: clean
	export NODE_ENV=production
	npx webpack && npx web-ext build -o -a artifacts -s dist

.PHONY: clean
clean:
	rm -rf dist web-ext-artifacts

.PHONY: run
run:
	npx webpack --watch &
	WEBPACK=$$!
	trap "kill $$WEBPACK" EXIT
	npx web-ext run -s dist

.PHONY: fmt
fmt:
	npx prettier --write src/**/*.ts

.PHONY: lint
lint:
	npx eslint --fix src/**/*.ts
