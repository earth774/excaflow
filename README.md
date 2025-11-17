# Excalidraw Rooms - Next.js

แอปพลิเคชันจัดการห้องวาดภาพด้วย Excalidraw ที่สร้างด้วย Next.js App Router

## คุณสมบัติ

- 🏠 **จัดการห้อง**: สร้าง, ดูรายการ, และลบห้องวาดภาพ
- 💾 **Auto Save**: บันทึกข้อมูลการวาดอัตโนมัติใน Local Storage
- 📱 **Responsive**: รองรับการใช้งานบนมือถือและแท็บเล็ต
- 🎯 **Real-time Status**: แสดงสถานะการบันทึกแบบ Real-time
- ⏰ **Timestamp**: แสดงเวลาบันทึกล่าสุดของแต่ละห้อง
- 🌙 **Dark Mode**: รองรับ Dark Mode อัตโนมัติ

## 🚀 การติดตั้ง

1. Clone โปรเจค:

```bash
git clone <repository-url>
cd excalidraw-nextjs
```

2. ติดตั้ง dependencies:

```bash
npm install
```

3. รันแอปพลิเคชัน:

```bash
npm run dev
```

4. เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

## 📖 วิธีการใช้งาน

### 1. สร้างห้องใหม่

- ไปที่หน้าหลัก (`/`)
- ใส่ชื่อห้องในช่อง "สร้างห้องใหม่"
- กดปุ่ม "สร้างห้อง" หรือกด Enter

### 2. เข้าห้อง

- คลิกปุ่ม "เข้าห้อง" ที่ห้องที่ต้องการ
- หรือพิมพ์ URL โดยตรง: `http://localhost:3000/room/[ชื่อห้อง]`

### 3. การบันทึกข้อมูล

- **อัตโนมัติ**: ข้อมูลจะถูกบันทึกอัตโนมัติเมื่อมีการวาด (debounce 1 วินาที)
- **สถานะ**: ดูสถานะการบันทึกที่มุมบนขวา
  - ✅ บันทึกแล้ว
  - ⚠️ มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
  - 🔄 กำลังบันทึก...
- **เวลา**: แสดงเวลาบันทึกล่าสุด

### 4. ลบห้อง

- คลิกปุ่ม "ลบ" ที่ห้องที่ต้องการลบ
- ข้อมูลห้องและข้อมูลการวาดจะถูกลบออกจาก Local Storage

### 5. กลับไปหน้าหลัก

- คลิกปุ่ม "← กลับไปหน้าหลัก" ที่มุมบนซ้ายของห้อง

## 💾 ระบบการบันทึกข้อมูล

### Local Storage Keys

- `excalidraw-rooms`: รายชื่อห้องทั้งหมด (JSON array)
- `excalidraw-room-[roomId]`: ข้อมูลการวาดของแต่ละห้อง (JSON)
- `excalidraw-room-[roomId]-last-saved`: เวลาบันทึกล่าสุด (string)

### ข้อมูลที่บันทึก

```typescript
interface DrawingData {
  elements: unknown[];        // องค์ประกอบการวาด
  appState: Record<string, unknown>;  // สถานะแอปพลิเคชัน
  timestamp: number;         // เวลาบันทึก
}
```

### การกู้คืนข้อมูล

- ข้อมูลจะถูกโหลดอัตโนมัติเมื่อเข้าห้อง
- หากไม่มีข้อมูลที่บันทึกไว้ จะเริ่มต้นด้วยกระดานว่าง

## 🛠️ เทคโนโลยีที่ใช้

- **Next.js 16**: React framework with App Router
- **React 19**: Frontend library
- **TypeScript**: Type safety
- **Excalidraw**: Drawing library
- **Tailwind CSS**: Styling
- **Local Storage**: Data persistence

## 📁 โครงสร้างโปรเจค

```
excalidraw-nextjs/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page (Room List)
│   ├── globals.css             # Global styles
│   └── room/
│       └── [roomId]/
│           └── page.tsx        # Room drawing page
├── lib/
│   ├── types.ts                # TypeScript types
│   └── storage.ts              # Local Storage utilities
├── package.json                # Dependencies
└── README.md                   # This file
```

## 🔧 การปรับแต่ง

### เพิ่มคุณสมบัติใหม่

คุณสามารถเพิ่มคุณสมบัติใหม่ได้โดยการแก้ไขไฟล์:

- `app/page.tsx`: เพิ่มฟีเจอร์ในหน้า Room List
- `app/room/[roomId]/page.tsx`: เพิ่มฟีเจอร์ในหน้า Room Drawing
- `lib/storage.ts`: เพิ่มฟังก์ชันจัดการข้อมูล

### ปรับแต่ง UI

แก้ไขไฟล์ `app/globals.css` หรือใช้ Tailwind CSS classes เพื่อปรับแต่ง:

- สี
- ฟอนต์
- Layout
- Animations

### ปรับแต่งการบันทึก

แก้ไขฟังก์ชันใน `lib/storage.ts`:

- เปลี่ยนจาก Local Storage เป็น Database
- เพิ่มการบีบอัดข้อมูล
- เพิ่มการเข้ารหัสข้อมูล

## 🌐 การ Deploy

### Vercel (แนะนำ)

1. Push โค้ดไปยัง GitHub
2. เชื่อมต่อกับ Vercel
3. Deploy อัตโนมัติ

### Netlify

1. Push โค้ดไปยัง GitHub
2. เชื่อมต่อกับ Netlify
3. Build command: `npm run build`
4. Publish directory: `.next`

## 🤝 การมีส่วนร่วม

1. Fork โปรเจค
2. สร้าง feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit การเปลี่ยนแปลง (`git commit -m 'Add some AmazingFeature'`)
4. Push ไปยัง branch (`git push origin feature/AmazingFeature`)
5. สร้าง Pull Request

## 📄 License

MIT License

## 🆘 การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

1. **Excalidraw ไม่โหลด**
   - ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
   - ลองรีเฟรชหน้า

2. **ห้องไม่แสดง**
   - ตรวจสอบ Local Storage ใน DevTools
   - ลองล้าง cache ของเบราว์เซอร์

3. **URL ไม่ทำงาน**
   - ตรวจสอบ Next.js routing setup
   - ตรวจสอบ server configuration

4. **ข้อมูลไม่บันทึก**
   - ตรวจสอบ Local Storage quota
   - ลองล้าง cache ของเบราว์เซอร์
   - ตรวจสอบ Console สำหรับ error

5. **ข้อมูลหาย**
   - ตรวจสอบ Local Storage
   - ข้อมูลจะหายเมื่อล้าง cache หรือใช้ Private mode

## 🔮 แผนการพัฒนาต่อ

- ระบบการแชร์ห้อง
- การ export/import ข้อมูล
- ระบบ authentication
- การบันทึกภาพ
- การทำงานร่วมกันแบบ Real-time
- ระบบ backup ข้อมูล
