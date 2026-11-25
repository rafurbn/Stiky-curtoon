import type { ComicItem } from '../types/comic';
import { computeUpcomingBdSlots, DEFAULT_BD_SLOTS } from './scheduleHelper';

const initialSlots = computeUpcomingBdSlots(DEFAULT_BD_SLOTS, 4, 0);

export const STARTER_COMICS: ComicItem[] = [
  {
    id: 'starter_rafu_folk_01',
    title: 'বাথরুম দখল করে সিনেমার ডায়লগ!',
    category: 'বন্ধুদের আড্ডা ও টাকা ধার',
    layout: '2-panel',
    paperTheme: 'studio_white',
    seed: 104729,
    createdAt: new Date().toISOString(),
    scheduledFor: initialSlots[0]?.toISOString(),
    status: 'draft',
    fbCaption:
      'সকালবেলা মেসের বাথরুমে ঢুকে কেউ আর বের না হলে আপনার অবস্থা কী হয়? 🤣🚪\n\n#RafuFolk #BanglaCartoon #MessLife',
    panels: [
      {
        panelIndex: 0,
        captionTop: 'সকাল ৮টা · দরজার বাইরে',
        sceneProp: 'exclamation',
        moodFx: 'sweat',
        characters: [
          {
            id: 'rafu',
            name: 'রাফু',
            side: 'left',
            expression: 'crying',
            pose: 'hands_up',
            speech: 'দোস্ত ১ মিনিটের জন্য বের হ না ভাই, আর পারছি না!',
          },
          {
            id: 'folk',
            name: 'ফোক',
            side: 'right',
            expression: 'angry',
            pose: 'pointing',
            speech: 'থাম! ব্যাস অনেক হয়ে গেছে, একদম চিল্লাবি না!',
          },
        ],
      },
      {
        panelIndex: 1,
        captionTop: '২ মিনিট পর...',
        sceneProp: 'sweat',
        moodFx: 'exclamation',
        characters: [
          {
            id: 'folk',
            name: 'ফোক',
            side: 'left',
            expression: 'shocked',
            pose: 'facepalm',
            speech: 'এই যা! তুই তো দরজার সামনেই বসে পড়লি?!',
          },
          {
            id: 'rafu',
            name: 'রাফু',
            side: 'right',
            expression: 'deadpan',
            pose: 'shrugging',
            speech: 'আগেই বলেছিলাম দোস্ত, সময় হাতে ছিল না!',
          },
        ],
      },
    ],
  },
  {
    id: 'starter_rafu_folk_02',
    title: 'টাকা ধার চাইলেই বন্ধুর নেটওয়ার্ক গায়েব!',
    category: 'টাকা ধার ও মেস লাইফ',
    layout: '2-panel',
    paperTheme: 'cream_sketch',
    seed: 229140,
    createdAt: new Date().toISOString(),
    scheduledFor: initialSlots[1]?.toISOString(),
    status: 'scheduled',
    fbCaption:
      'টাকা ফেরত চাইলেই আপনার কোন বন্ধুর ফোনে হ্যালো হ্যালো শোনা যায় না? 📞😂\n\n#RafuFolk #BanglaMeme #Friends',
    panels: [
      {
        panelIndex: 0,
        captionTop: 'মাসের ১ তারিখ',
        sceneProp: 'money',
        moodFx: 'sparkles',
        characters: [
          {
            id: 'folk',
            name: 'ফোক',
            side: 'left',
            expression: 'happy',
            pose: 'hands_up',
            speech: 'দোস্ত ৫০০ দে তো, শুক্রবারই ফেরত দেব পাকা!',
          },
          {
            id: 'rafu',
            name: 'রাফু',
            side: 'right',
            expression: 'wink',
            pose: 'standing',
            speech: 'নে ভাই, শুক্রবার যেন মনে থাকে!',
          },
        ],
      },
      {
        panelIndex: 1,
        captionTop: '৬ মাস পর...',
        sceneProp: 'smartphone',
        moodFx: 'question',
        characters: [
          {
            id: 'rafu',
            name: 'রাফু',
            side: 'left',
            expression: 'angry',
            pose: 'holding_phone',
            speech: 'কী রে! আমার ৫০০ টাকা কবে দিবি?',
          },
          {
            id: 'folk',
            name: 'ফোক',
            side: 'right',
            expression: 'deadpan',
            pose: 'shrugging',
            speech: 'হ্যালো? হ্যালো? নেট নাই দোস্ত, পরে কথা হবে!',
          },
        ],
      },
    ],
  },
];

export const STARTER_COMIC: ComicItem = STARTER_COMICS[0];
