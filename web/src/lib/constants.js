export const REGIONS = {
  "Andijon viloyati": ["Andijon", "Asaka", "Baliqchi", "Bo'z", "Buloqboshi", "Izboskan", "Jalaquduq", "Xo'jaobod", "Qo'rg'ontepa", "Marhamat", "Oltinko'l", "Paxtaobod", "Shahrixon", "Ulug'nor"],
  "Buxoro viloyati": ["Buxoro", "Vobkent", "G'ijduvon", "Jondor", "Kogon", "Qorako'l", "Qorovulbozor", "Olot", "Peshku", "Romitan", "Shofirkon"],
  "Farg'ona viloyati": ["Beshariq", "Bag'dod", "Buvayda", "Dang'ara", "Farg'ona", "Furqat", "Qo'shtepa", "Quva", "Rishton", "So'x", "Toshloq", "Uchko'prik", "O'zbekiston", "Oltiariq", "Yozyovon"],
  "Jizzax viloyati": ["Arnasoy", "Baxmal", "Do'stlik", "Forish", "G'allaorol", "Sharof Rashidov", "Mirzacho'l", "Paxtakor", "Yangiobod", "Zomin", "Zafarobod", "Zarbdor"],
  "Xorazm viloyati": ["Bog'ot", "Gurlan", "Xonqa", "Hazorasp", "Xiva", "Qo'shko'pir", "Shovot", "Urganch", "Yangiariq", "Yangibozor", "Tuproqqal'a"],
  "Namangan viloyati": ["Chortoq", "Chust", "Kosonsoy", "Mingbuloq", "Namangan", "Norin", "Pop", "To'raqo'rg'on", "Uchqo'rg'on", "Uychi", "Yangiqo'rg'on"],
  "Navoiy viloyati": ["Karmana", "Konimex", "Qiziltepa", "Navbahor", "Nurota", "Tomdi", "Uchquduq", "Xatirchi"],
  "Qashqadaryo viloyati": ["Chiroqchi", "Dehqonobod", "G'uzor", "Qamashi", "Qarshi", "Koson", "Kasbi", "Kitob", "Ko'kdala", "Mirishkor", "Muborak", "Nishon", "Shahrisabz", "Yakkabog'"],
  "Qoraqalpog'iston Respublikasi": ["Amudaryo", "Beruniy", "Bo'zatov", "Chimboy", "Ellikqal'a", "Kegeyli", "Mo'ynoq", "Nukus", "Qanliko'l", "Qo'ng'irot", "Qorao'zak", "Shumanay", "Taxiatosh", "Taxtako'pir", "To'rtko'l", "Xo'jayli"],
  "Samarqand viloyati": ["Bulung'ur", "Ishtixon", "Jomboy", "Kattaqo'rg'on", "Qo'shrabot", "Narpay", "Nurobod", "Oqdaryo", "Paxtachi", "Payariq", "Pastdarg'om", "Samarqand", "Toyloq", "Urgut"],
  "Sirdaryo viloyati": ["Boyovut", "Guliston", "Xovos", "Mirzaobod", "Oqoltin", "Sardoba", "Sayxunobod", "Sirdaryo"],
  "Surxondaryo viloyati": ["Angor", "Bandixon", "Boysun", "Denov", "Jarqo'rg'on", "Qiziriq", "Qumqo'rg'on", "Muzrabot", "Oltinsoy", "Sariosiyo", "Sherobod", "Sho'rchi", "Termiz", "Uzun"],
  "Toshkent viloyati": ["Bekobod", "Bo'stonliq", "Bo'ka", "Chinoz", "Qibray", "Ohangaron", "Oqqo'rg'on", "Parkent", "Piskent", "Quyichirchiq", "O'rtachirchiq", "Yangiyo'l", "Yuqorichirchiq", "Zangiota", "Toshkent tumani"],
};
export const DEFAULT_REGION = "Samarqand viloyati";

export const ANIMALS = [
  { id: "sigir", n: "Sigir", p: '<path d="M4 9c0-2 1-3 3-3h10c2 0 3 1 3 3v4c0 1-1 2-2 2h-1v4h-2v-4H9v4H7v-4H6c-1 0-2-1-2-2z"/><path d="M6 6 4 3M18 6l2-3"/><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/>' },
  { id: "qoy", n: "Qo'y", p: '<path d="M6 10c-1.5 0-2.5-1-2.5-2.5S5 5 6.5 5.5C7 4 9 3.5 10 4.5 11 3.5 13 3.5 14 4.5c1-1 3-.5 3.5 1C19 5 20.5 6 20.5 7.5S19.5 10 18 10v3c0 2-2 3-6 3s-6-1-6-3z"/><path d="M9 16v4M15 16v4"/>' },
  { id: "echki", n: "Echki", p: '<path d="M7 4 9 8M17 4l-2 4"/><path d="M8 8h8l1 5-2 3H9l-2-3z"/><path d="M11 16v3l1 2 1-2v-3"/>' },
  { id: "ot", n: "Ot", p: '<path d="M15 3c2 1 4 3 4 6l-2 1-2-2-3 4v8H8v-6L5 12l2-5c2-3 5-4 8-4z"/><path d="M12 5 10 8"/>' },
  { id: "parranda", n: "Parranda", p: '<path d="M9 5a3 3 0 0 1 6 1v2c3 1 5 3 5 6a6 6 0 0 1-12 0c0-2 1-3 1-5z"/><path d="M9 6 6 7l3 1M11 20v2M14 20v2"/>' },
  { id: "boshqa", n: "Boshqa", p: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2z"/>' },
];
export const animalName = (id) => (ANIMALS.find((a) => a.id === id) || { n: id }).n;

export const SYMPTOMS = ["Isitma", "Ishtahasizlik", "Ich ketishi", "Yo'tal", "Qorin dam bo'lgan", "Oqsoqlanish", "Yelin shishgan",
  "Teri, jun to'kilishi", "Tug'ruq qiyinchiligi", "Holsizlik", "Ko'z-burun oqishi", "Sut kamaygan"];

export const SPECS = ["Yirik shoxli mol", "Qo'y-echki", "Ot", "Parranda", "Tug'ruq", "Jarrohlik", "Sun'iy urug'lantirish", "Emlash"];

export const URGENCY = {
  shoshilinch: ["Shoshilinch", "bad"],
  bugun: ["Bugun ichida", "warn"],
  maslahat: ["Faqat maslahat", "ok"],
};

export const CASE_STATUS = {
  new: ["Yangi", "warn"], accepted: ["Qabul qilindi", "ok"], on_way: ["Yo'lda", "ok"], arrived: ["Yetib keldi", "ok"],
  done: ["Yakunlandi", "mute"], declined: ["Rad etildi", "bad"], cancelled: ["Bekor qilindi", "mute"],
};
export const RES_STATUS = {
  new: ["Yangi", "warn"], ready: ["Tayyor", "ok"], done: ["Berildi", "mute"], cancelled: ["Bekor qilindi", "mute"],
};
export const VET_STATUS = {
  online: ["Bo'sh", "ok"], busy: ["Band", "warn"], offline: ["Ishda emas", "mute"],
};

export const ROLE_NAMES = { farmer: "Chorvador", vet: "Veterinar", pharmacy: "Dorixona" };
export const ROLE_HOME = { farmer: "/new", vet: "/inbox", pharmacy: "/orders" };
