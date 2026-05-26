.PHONY: install dev build test test-watch lint format benchmark stress docker-up docker-down migration-up migration-down clean check-secrets

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

test-watch:
	npm run test:watch

lint:
	npm run lint

format:
	npm run format

benchmark:
	npm run benchmark

stress:
	npm run stress

docker-up:
	docker compose up -d mariadb

docker-down:
	docker compose down

migration-up: build
	npm run migration:up

migration-down: build
	npm run migration:down

clean:
	rm -rf dist node_modules coverage

check-secrets:
	chmod +x scripts/check-secrets.sh
	./scripts/check-secrets.sh
