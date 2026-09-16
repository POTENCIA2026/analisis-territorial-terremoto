"""Inspección reproducible de fuentes públicas educativas, sin tocar observaciones."""
import csv, io, json, hashlib, re
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
ROOT = Path(__file__).resolve().parents[1]
PAGE = "https://portalsineb.mineducacion.gov.co/portal/secciones/Informacion-Estadistica/Bases-consolidadas/"
def get(url):
    with urlopen(Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=45) as response:
        return response.read(), response.geturl()
def main():
    out={"page":PAGE,"downloads":[],"apis":[]}
    try:
        raw, _=get(PAGE)
        text=raw.decode("utf-8",errors="replace")
        out["csv_links"]=[urljoin(PAGE,h) for h in re.findall(r'href=["\']([^"\']+\.csv[^"\']*)',text)]
    except Exception as exc:
        out["page_error"]=str(exc)
    urls=list(dict.fromkeys(out.get("csv_links",[]) + [
      "https://portalsineb.mineducacion.gov.co/1782/articles-417663_recurso_1.csv",
      "https://portalsineb.mineducacion.gov.co/portal/articles-417663_recurso_1.csv",
      "https://www.mineducacion.gov.co/1780/articles-417663_recurso_1.csv"]))
    urls=[url for url in urls if "417663" in url]
    for url in urls:
        result={"url":url}
        try:
            raw,actual=get(url)
            result.update(actual=actual,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
            encoding="utf-8-sig"
            try: text=raw.decode(encoding)
            except UnicodeDecodeError: encoding="cp1252"; text=raw.decode(encoding)
            if text.lstrip().lower().startswith(("<!doctype","<html")): raise ValueError("HTML, no CSV")
            dialect=csv.Sniffer().sniff(text[:8000],delimiters=";,\t|")
            reader=csv.DictReader(io.StringIO(text),dialect=dialect)
            rows=list(reader)
            result.update(encoding=encoding,delimiter=dialect.delimiter,columns=reader.fieldnames,rows=len(rows),
                          samples=[{k:v for k,v in r.items() if re.search("AÑO|ANO|COD|MUNIC|SEDE|SECTOR|TOTAL|ANIO",k,re.I)} for r in rows[:2]])
        except Exception as exc: result["error"]=str(exc)
        out["downloads"].append(result)
    for dataset in ["x5ay-984n","j9sd-zau5"]:
        item={"id":dataset}
        try:
            raw,_=get("https://www.datos.gov.co/api/views/"+dataset+".json")
            meta=json.loads(raw)
            item.update(name=meta.get("name"),description=meta.get("description"),publisher=meta.get("attribution"),
                        columns=[(c["fieldName"],c.get("name"),c.get("dataTypeName")) for c in meta["columns"] if not c["fieldName"].startswith(":")])
        except Exception as exc:item["error"]=str(exc)
        out["apis"].append(item)
    target=ROOT/"data/simat_source_probe.json"
    target.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
