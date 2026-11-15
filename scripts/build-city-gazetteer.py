"""Build a compact exact-match city index from the GeoNames tab-delimited files."""

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


DUMP_URL = "https://download.geonames.org/export/dump/"
MIN_POPULATION = 500_000
COUNTRY_ALIASES = {
    "AE": ["UAE"],
    "CD": ["DR Congo", "Democratic Republic of Congo"],
    "CI": ["Côte d’Ivoire"],
    "CZ": ["Czech Republic"],
    "GB": ["UK", "U.K.", "Great Britain"],
    "KR": ["Republic of Korea"],
    "US": ["U.S.", "U.S.A.", "United States of America"],
}
CITY_ALIASES = {
    1275339: ["Bombay"],
    1275004: ["Calcutta"],
    1609350: ["Krung Thep"],
    1816670: ["Peking"],
    1850147: ["Tokyo"],
    3530597: ["Mexico City"],
    5128581: ["New York", "NYC"],
}


def normalize(name):
    name = unicodedata.normalize("NFD", name)
    name = re.sub("[\u0300-\u036f]", "", name).replace("’", "'").replace("‘", "'")
    return re.sub(r"[,\s]+", " ", name.lower()).strip()


def rows(path):
    with path.open(encoding="utf-8") as source:
        for line in source:
            if line.strip() and not line.startswith("#"):
                yield line.rstrip("\r\n").split("\t")


@dataclass
class City:
    id: int
    name: str
    ascii_name: str
    alternate_names: str
    latitude: float
    longitude: float
    feature: str
    country: str
    admin: str
    population: int

    @classmethod
    def from_row(cls, row):
        return cls(
            int(row[0]), row[1], row[2], row[3], float(row[4]), float(row[5]),
            row[7], row[8], row[10], int(row[14] or 0),
        )

    @property
    def admin_key(self):
        return f"{self.country}.{self.admin}"


def qualifiers(city, countries, regions):
    country_name, country_iso3 = countries[city.country]
    country_terms = {country_name, city.country, country_iso3, *COUNTRY_ALIASES.get(city.country, [])}
    region_terms = set(regions.get(city.admin_key, ()))
    if city.country == "US" and city.admin.isalpha():
        region_terms.add(city.admin)
    return {
        normalize(term)
        for term in ["", *country_terms, *region_terms]
    } | {
        normalize(f"{region} {country}")
        for region in region_terms
        for country in country_terms
    }


def keys(names, areas):
    for name in {normalize(value) for value in names if value.strip()}:
        for area in areas:
            yield f"{name} {area}" if area else name


def build(input_dir, snapshot):
    countries = {row[0]: (row[4], row[1]) for row in rows(input_dir / "countryInfo.txt")}
    regions = {row[0]: (row[1], row[2]) for row in rows(input_dir / "admin1CodesASCII.txt")}
    cities = [
        City.from_row(row) for row in rows(input_dir / "cities15000.txt")
        if row[6] == "P" and row[8] in countries and row[7] not in {"PPLH", "PPLQ"}
    ]
    selected = {
        city.id: city for city in cities
        if city.feature != "PPLX"
        and (city.population >= MIN_POPULATION or city.feature == "PPLC" or city.country == "PK")
    }

    matches = {}
    ambiguous = set()
    for city in selected.values():
        names = [city.name, city.ascii_name, *CITY_ALIASES.get(city.id, [])]
        for key in keys(names, qualifiers(city, countries, regions)):
            previous = matches.setdefault(key, city.id)
            if previous != city.id:
                ambiguous.add(key)

    # Compare possible exact matches with every record, including alternate names
    # and smaller cities outside the shipped subset.
    candidate_names = {key.split(" ", 1)[0] for key in matches}
    for city in cities:
        names = [
            name for name in {city.name, city.ascii_name, *city.alternate_names.split(",")}
            if normalize(name).split(" ", 1)[0] in candidate_names
        ]
        if not names:
            continue
        for key in keys(names, qualifiers(city, countries, regions)):
            if key in matches and matches[key] != city.id:
                ambiguous.add(key)

    accepted = {key: city_id for key, city_id in sorted(matches.items()) if key not in ambiguous}
    ids = sorted(set(accepted.values()))
    offsets = {city_id: index for index, city_id in enumerate(ids)}
    return {
        "source": {
            "name": "GeoNames",
            "url": DUMP_URL,
            "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "snapshot": snapshot,
            "files": ["cities15000.zip", "countryInfo.txt", "admin1CodesASCII.txt"],
        },
        "countries": {code.lower(): countries[code][0] for code in sorted({selected[i].country for i in ids})},
        "rows": [
            [city.id, city.name, city.latitude, city.longitude, city.country.lower(),
             regions.get(city.admin_key, ("",))[0]]
            for city in (selected[i] for i in ids)
        ],
        "lookup": {key: offsets[city_id] for key, city_id in accepted.items()},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--snapshot", required=True, help="Source download date (YYYY-MM-DD)")
    args = parser.parse_args()
    data = build(args.input_directory, args.snapshot)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(data['rows']):,} cities across {len(data['countries']):,} countries and territories")
