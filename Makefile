.PHONY: test

test:
	python3 -m unittest discover -s tests -v
	python3 -m py_compile install home/.local/bin/claude-room
