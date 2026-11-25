import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  Play,
  Send,
  Trash2,
} from 'lucide-react';
import type { ComicItem, SavedRenderedVideo, VideoItem } from '../types/comic';
import { getRenderedVideoBlobFromVault } from '../lib/videoStorage';

interface HistoryQueueViewProps {
  comics: ComicItem[];
  videos: VideoItem[];
  savedRenderedVideos: SavedRenderedVideo[];
  publishingId: string | null;
  onSelectComic: (comic: ComicItem) => void;
  onSelectVideo: (video: VideoItem) => void;
  onPublishComic: (comic: ComicItem) => void;
  onDownloadComic: (comic: ComicItem) => void;
  onDeleteComic: (id: string) => void;
  onDeleteVideoProject: (id: string) => void;
  onDeleteSavedRenderedVideo: (id: string) => Promise<void>;
}

export function HistoryQueueView({
  comics,
  videos,
  savedRenderedVideos,
  publishingId,
  onSelectComic,
  onSelectVideo,
  onPublishComic,
  onDownloadComic,
  onDeleteComic,
  onDeleteVideoProject,
  onDeleteSavedRenderedVideo,
}: HistoryQueueViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'saved_mp4' | 'video_projects' | 'comics'>(
    'saved_mp4'
  );
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);

  const handlePlaySaved = async (item: SavedRenderedVideo) => {
    const blob = await getRenderedVideoBlobFromVault(item.id);
    if (blob) {
      setPreviewVideo({ title: item.title, url: URL.createObjectURL(blob) });
      return;
    }
    if (item.serverUrl) {
      setPreviewVideo({ title: item.title, url: item.serverUrl });
    }
  };

  const handleDownloadSaved = async (item: SavedRenderedVideo) => {
    const blob = await getRenderedVideoBlobFromVault(item.id);
    const ext = item.mimeType?.includes('mp4') ? 'mp4' : 'webm';
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    }
    if (item.serverUrl) {
      const a = document.createElement('a');
      a.href = `${item.serverUrl}?download=1`;
      a.download = `${item.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const renderStatus = (status: ComicItem['status']) => {
    if (status === 'published') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>প্রকাশিত</span>
        </span>
      );
    }
    if (status === 'scheduled') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
          <Clock className="h-3.5 w-3.5" />
          <span>শিডিউলড</span>
        </span>
      );
    }
    return <span className="text-xs font-medium text-slate-500">ড্রাফট</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            সংরক্ষিত ভিডিও ও কার্টুন আর্কাইভ
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            রেন্ডার করা সব MP4 ভিডিও, ভিডিও প্রজেক্ট ও কমিক স্ট্রিপ এখানে স্থায়ীভাবে সংরক্ষিত থাকে।
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('saved_mp4')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              activeSubTab === 'saved_mp4'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>সেইভ করা MP4 ({savedRenderedVideos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('video_projects')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              activeSubTab === 'video_projects'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ভিডিও প্রজেক্ট ({videos.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('comics')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              activeSubTab === 'comics'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>কমিক ছবি ({comics.length})</span>
          </button>
        </div>
      </div>

      {previewVideo && (
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
            <span>{previewVideo.title}</span>
            <button
              type="button"
              onClick={() => setPreviewVideo(null)}
              className="rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              বন্ধ করুন
            </button>
          </div>
          <video
            src={previewVideo.url}
            controls
            autoPlay
            className="mx-auto max-h-[460px] rounded-lg bg-black"
          />
        </div>
      )}

      {activeSubTab === 'saved_mp4' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {savedRenderedVideos.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              এখনো কোনো MP4 ভিডিও সেইভ হয়নি। ভিডিও স্টুডিও থেকে{' '}
              <strong>"ভিডিও রেন্ডার ও স্থায়ীভাবে সেইভ করুন"</strong> বাটন চাপুন।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">ভিডিওর নাম</th>
                    <th className="px-4 py-3">স্টাইল</th>
                    <th className="px-4 py-3">সময় ও সাইজ</th>
                    <th className="px-4 py-3">তৈরির সময়</th>
                    <th className="px-6 py-3 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {savedRenderedVideos.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-semibold text-slate-900">{item.title}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {item.renderStyle === 'cartoon_2d' ? '২ডি রঙিন' : 'স্টিক ফিগার মিম'} ·{' '}
                        {item.aspectRatio}
                      </td>
                      <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-600">
                        {item.durationSec.toFixed(1)}s ·{' '}
                        {(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </td>
                      <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString('bn-BD', {
                          timeZone: 'Asia/Dhaka',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePlaySaved(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                          >
                            <Play className="h-3.5 w-3.5" />
                            <span>প্লে</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSaved(item)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>ডাউনলোড</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSavedRenderedVideo(item.id)}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:text-red-600"
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
      )}

      {activeSubTab === 'video_projects' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-6 py-3">প্রজেক্ট</th>
                  <th className="px-4 py-3">দৃশ্য</th>
                  <th className="px-4 py-3">স্ট্যাটাস</th>
                  <th className="px-6 py-3 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {videos.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-slate-900">{v.title}</div>
                      <div className="text-xs text-slate-500">{v.category}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-600">
                      {v.scenes.length} দৃশ্য · {v.totalDurationSec}s
                    </td>
                    <td className="px-4 py-3.5">{renderStatus(v.status)}</td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectVideo(v)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>স্টুডিওতে খুলুন</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteVideoProject(v.id)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:text-red-600"
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
        </div>
      )}

      {activeSubTab === 'comics' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-6 py-3">কমিক</th>
                  <th className="px-4 py-3">লেআউট</th>
                  <th className="px-4 py-3">স্ট্যাটাস</th>
                  <th className="px-6 py-3 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comics.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.category}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono-tabular text-xs text-slate-600">
                      {item.layout}
                    </td>
                    <td className="px-4 py-3.5">{renderStatus(item.status)}</td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectComic(item)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>দেখুন</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadComic(item)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPublishComic(item)}
                          disabled={publishingId === item.id}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>পোস্ট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComic(item.id)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:text-red-600"
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
        </div>
      )}
    </div>
  );
}
