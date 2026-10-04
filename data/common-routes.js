/**
 * مسیرهای پرتکرار عملیاتی.
 *
 * در این نسخه فقط مسیرهایی نگه داشته می‌شوند که همه فرودگاه‌هایشان در
 * کشورهای مجاز (ایران، ترکیه، عراق، عمان) قرار دارند. مسیرهای خارج از
 * این چهار کشور (قطر، امارات، بریتانیا و ...) از این فایل حذف شده‌اند و
 * به Route Library منتقل نمی‌شوند.
 */

export const COMMON_ROUTES = [
  {
    id: "tehran-istanbul-muscat",
    label: "تهران → استانبول → مسقط",
    airports: ["IKA", "IST", "IST", "MCT"],
  },
  {
    id: "tehran-istanbul-sabiha-muscat",
    label: "تهران → استانبول → مسقط (اتصال در SAW)",
    airports: ["IKA", "IST", "SAW", "MCT"],
  },
  {
    id: "tehran-istanbul-baghdad",
    label: "تهران → استانبول → بغداد",
    airports: ["IKA", "IST", "IST", "BGW"],
  },
  {
    id: "tehran-istanbul-sabiha-baghdad",
    label: "تهران → استانبول → بغداد (اتصال در SAW)",
    airports: ["IKA", "IST", "SAW", "BGW"],
  },
  {
    id: "muscat-istanbul-tehran",
    label: "مسقط → استانبول → تهران",
    airports: ["MCT", "IST", "IST", "IKA"],
  },
  {
    id: "baghdad-istanbul-muscat",
    label: "بغداد → استانبول → مسقط",
    airports: ["BGW", "IST", "IST", "MCT"],
  },
  {
    id: "tehran-baghdad-muscat",
    label: "تهران → بغداد → مسقط",
    airports: ["IKA", "BGW", "BGW", "MCT"],
  },
  {
    id: "muscat-baghdad-tehran",
    label: "مسقط → بغداد → تهران",
    airports: ["MCT", "BGW", "BGW", "IKA"],
  },
];
