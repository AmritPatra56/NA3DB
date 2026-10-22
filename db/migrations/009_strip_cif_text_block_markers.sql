-- Strip the CIF multi-line markers that leaked into two titles.
--
-- A CIF value can be written three ways: 'quoted', "quoted", or as a block
-- between two semicolons on their own lines. load_cif.py's
-- _parse_single_values stripped the first two and not the third, so a title
-- written as a block kept its markers:
--
--   ";High-resolution crystal structure of a fully modified ... duplex ;"
--
-- Two rows in the whole database, both entry 363D: struct.title and
-- citation.title. Found by reading the parser, not by anything failing.
--
-- The parser is fixed in the same commit, which covers every future load.
-- This repairs what is already stored, because those files may never be
-- loaded again.
--
-- Both a leading AND a trailing semicolon are required, so the 15 titles that
-- legitimately contain one in the middle are untouched -- for example
-- "Structure of RacA-DNA complex; P21 form".

UPDATE struct
   SET title = btrim(regexp_replace(title, '^;(.*);$', '\1'))
 WHERE title LIKE ';%' AND title LIKE '%;';

UPDATE citation
   SET title = btrim(regexp_replace(title, '^;(.*);$', '\1'))
 WHERE title LIKE ';%' AND title LIKE '%;';

-- doc holds a copy of struct.title, so it is wrong until rebuilt. Plain
-- REFRESH rather than CONCURRENTLY: migrate.mjs runs each migration inside a
-- transaction, and CONCURRENTLY cannot run in one.
REFRESH MATERIALIZED VIEW doc;
