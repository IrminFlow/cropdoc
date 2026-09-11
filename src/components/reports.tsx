"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { ReportList, Loading, ErrorNotice, type ListItem } from "./common";
export function Reports() {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ inspections: ListItem[] }>(`/api/inspections?page=${page}`)
      .then((x) => {
        if (active) setItems(x.inspections);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My reports</h1>
          <p>Your saved crop photos and care steps.</p>
        </div>
        <Link href="/upload" className="button">
          <Plus size={17} /> Check crop
        </Link>
      </div>
      <section className="panel">
        {error ? (
          <ErrorNotice message={error} />
        ) : items ? (
          <ReportList items={items} />
        ) : (
          <Loading />
        )}
      </section>
      <div className="pagination">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage((x) => x - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button secondary"
          disabled={!items || items.length < 20}
          onClick={() => setPage((x) => x + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
