import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Send,
  Trash2,
  Eye,
  Search,
} from 'lucide-react';
import type { ComicItem, PostStatus } from '../types/comic';

interface HistoryQueueViewProps {
  comics: ComicItem[];
  onSelectComic: (comic: ComicItem) => void;
  onPublishComic: (comic: ComicItem) => Promise<void>;
  onDownloadComic: (comic: ComicItem) => Promise<void>;
  onDeleteComic: (id: string) => void;
  publishingId: string | null;
}

export function HistoryQueueView({
  comics,
  onSelectComic,
  onPublishComic,
  onDownloadComic,
  onDeleteComic,
  publishingId,
}: HistoryQueueViewProps) {
  const [filter, setFilter] = useState<'all' | PostStatus>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return comics.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.fbCaption.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [comics, filter, query]);

  const renderStatus = (status: PostStatus) => {
    if (status === 'published') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>প্রকাশিত</span>
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>ব্যর্থ</span>
        </span>
      );
    }
    if (status === 'scheduled') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          <span>শিডিউলড</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Clock className="h-3.5 w-3.5" />
        <span>ড্রাফট</span>
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'all', label: 'সব' },
              { id: 'scheduled', label: 'শিডিউলড' },
              { id: 'published', label: 'প্রকাশিত' },
              { id: 'draft', label: 'ড্রাফট' },
              { id: 'failed', label: 'ব্যর্থ' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="কার্টুন খুঁজুন..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-800">
            কোনো কার্টুন পাওয়া যায়নি
          </p>
          <p className="mt-1 text-xs text-slate-500">
            স্টুডিও থেকে নতুন স্টিক কার্টুন তৈরি করলে এখানে তার তালিকা জমা থাকবে।
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-600">
                <th className="px-6 py-3">শিরোনাম ও বিষয়</th>
                <th className="px-4 py-3">লেআউট</th>
                <th className="px-4 py-3">অবস্থা</th>
                <th className="px-4 py-3">সময়</th>
                <th className="px-6 py-3 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {item.category}
                      {item.fbPostId ? ` · Post ID: ${item.fbPostId}` : ''}
                      {item.errorMessage ? ` · ${item.errorMessage}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                    {item.layout}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {renderStatus(item.status)}
                  </td>
                  <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                    {new Date(
                      item.publishedAt || item.scheduledFor || item.createdAt
                    ).toLocaleString('bn-BD', {
                      timeZone: 'Asia/Dhaka',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                  <td className="px-6 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectComic(item)}
                        title="স্টুডিওতে দেখুন"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>দেখুন</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadComic(item)}
                        title="PNG ডাউনলোড"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onPublishComic(item)}
                        disabled={publishingId === item.id}
                        title="Facebook Page-এ পোস্ট"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>{publishingId === item.id ? 'হচ্ছে...' : 'পোস্ট'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteComic(item.id)}
                        title="মুছে ফেলুন"
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
