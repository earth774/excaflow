# Excaflow (excalidraw-nextjs)

เว็บแอป whiteboard บน Next.js สำหรับวาดไดอะแกรมและ flow — ข้อมูลห้องซิงก์กับ PostgreSQL ผ่าน Prisma มีโปรเจกต์/ห้องในแดชบอร์ด ยืนยันตัวตนด้วย Supabase และแผน Pro ผ่าน Stripe

## คุณสมบัติหลัก

- **ห้องวาด (Excalidraw)** — สร้าง/แชร์ลิงก์ห้อง, โหมดดูอย่างเดียวสำหรับผู้ที่ไม่ใช่เจ้าของ
- **ซิงก์กับเซิร์ฟเวอร์** — Save to Server / Check Status / Pull from Server; ร่างในเครื่องยังช่วยกันชนกับข้อมูลบน DB ได้
- **AI สร้างไดอะแกรม** — สร้าง Mermaid แล้วแปลงลงแคนวาส (ต้องตั้งค่า OpenAI)
- **โปรเจกต์** — จัดกลุ่มห้องเป็นโปรเจกต์; แผนฟรีมีขีดจำกัดจำนวนโปรเจกต์และห้องต่อโปรเจกต์ (ดู `lib/planTier.ts`)
- **แนบรูป** — อัปโหลดไฟล์ไป object storage (เช่น R2) เมื่อซิงก์ เพื่อให้เปิดบนเครื่องอื่นได้

## เทคโนโลยี

- Next.js (App Router), React, TypeScript, Tailwind CSS
- Excalidraw, Mermaid → Excalidraw
- PostgreSQL + Prisma
- Supabase Auth
- Stripe (สมัครสมาชิก Pro)

## การติดตั้งและรัน

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

ตั้งค่าตัวแปรสภาพแวดล้อมตามที่แอปใช้จริง (เช่น `DATABASE_URL`, คีย์ Supabase, Stripe, OpenAI, storage)

## โครงสร้างโฟลเดอร์ (ย่อ)

```
app/
  api/          # REST เช่น rooms, projects, subscription, checkout, AI
  dashboard/    # แดชบอร์ดหลังล็อกอิน
  room/[roomId]/ # หน้าแคนวาส
lib/
  planTier.ts   # ค่าคงที่ขีดจำกัดแผนฟรี
  planLimits.ts # ตรวจ Pro / จำกัดโปรเจกต์และห้องฝั่งเซิร์ฟเวอร์
```

## License

MIT License
