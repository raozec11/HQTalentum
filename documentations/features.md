# 🚀 Talentum Platform - Complete Feature Documentation

Welcome to the comprehensive feature catalog for **Talentum**, an enterprise-grade, multi-tenant Agency & Talent Management Platform. This document outlines every single architectural capability, workflow, dashboard tool, micro-feature, and UX optimization across the entire system.

---

## 📑 Table of Contents
1. [🏢 Multi-Tenant Architecture & Core Infrastructure](#1--multi-tenant-architecture--core-infrastructure)
2. [👑 Master Platform Admin Dashboard (`/master`)](#2--master-platform-admin-dashboard-master)
3. [🏢 Agency Admin Dashboard (`/[companyId]/dashboard/admin`)](#3--agency-admin-dashboard-companyiddashboardadmin)
4. [⭐ Talent Portal (`/[companyId]/dashboard/talent`)](#4--talent-portal-companyiddashboardtalent)
5. [💼 Client Portal (`/[companyId]/dashboard/client`)](#5--client-portal-companyiddashboardclient)
6. [🌐 Public Showcase & Guest Booking Flow](#6--public-showcase--guest-booking-flow)
7. [📅 Availability & Working Hours Engine](#7--availability--working-hours-engine)
8. [📩 Multi-Channel Notification & Email System](#8--multi-channel-notification--email-system)
9. [💳 Payments, Receipts & Financial Engine](#9--payments-receipts--financial-engine)
10. [💬 Real-Time Chat & Audit Trail System](#10--real-time-chat--audit-trail-system)
11. [🔐 Security, Verification & Role Controls](#11--security-verification--role-controls)

---

## 1. 🏢 Multi-Tenant Architecture & Core Infrastructure

* **Dynamic Subdomain & Slug Routing**:
  * Scoped routing via `/[companyId]/` allowing unlimited agencies to run on a single platform instance.
  * Case-insensitive, whitespace-safe company URL resolution (e.g. `/wild/`, `/Wild/`, `/WILD/`).
* **Strict Tenant Data Isolation**:
  * All Firestore collections (`users`, `talents`, `bookings`, `clients`, `locations`, `categories`) indexed and filtered by `companyId`.
* **White-Label Custom Branding per Tenant**:
  * Dynamic company logos, brand names, contact email, contact phone, custom primary colors, and footer branding loaded dynamically per agency.
* **Dedicated Company Login Pages (`/[companyId]/login`)**:
  * Branded login portals with agency logo and customized welcome text.
  * Automatic company affiliation check ensuring users from Company A cannot log into Company B's portal.
* **Self-Healing Admin Role Auto-Repair**:
  * Automatic detection and restoration of agency owner admin privileges if user roles ever become misconfigured during auth flows.
* **Responsive Modern UI**:
  * Tailored for Desktop, Tablet, and Mobile screens with sliding drawers, collapsible sidebars, dynamic grid cards, and touch-friendly controls.

---

## 2. 👑 Master Platform Admin Dashboard (`/master`)

* **Platform Overview & Analytics**:
  * Real-time metrics across all tenant agencies: Total Agencies, Total Active Talents, Total System Bookings, and Total Revenue.
* **Company Tenant Management (CRUD)**:
  * Create new agency tenants with custom URL slug, admin email, company name, logo upload, and subscription tiers.
  * Edit company settings, deactivate/suspend problematic agency tenants, or delete company records.
* **Global User & Staff Directory**:
  * Master search and directory of all platform users across all companies (Admins, Staff, Talents, Clients).
  * Direct role elevation or reassignment tools.
* **Global Financials & Commission Oversight**:
  * Track platform-wide subscription statuses, transaction logs, and Stripe gateway configurations.
* **Global System Settings & Credentials**:
  * Centralized configuration for Resend API keys, SMTP credentials, Twilio SMS settings, and system backup logs.

---

## 3. 🏢 Agency Admin Dashboard (`/[companyId]/dashboard/admin`)

### A. Dashboard Metrics & Overview
* Real-time counters: Active Talents, Pending Talent Updates, Active Jobs, Pending Job Requests, Monthly Revenue, and Average Agency Rating.
* Quick action shortcuts for adding new talents, creating manual bookings, or reviewing pending profile updates.

### B. Talent Record Management (Record Management)
* **Talent Roster**: Filter talents by status (`active`, `inactive`), search by name/email/ID, and sort by registration date.
* **Public vs Internal Name Control**:
  * Separate fields for **Public Display Name** (shown on public links & client portals) and **Real Name** (internal agency records only).
* **Multi-Format Image Upload Engine**:
  * High-speed image uploader supporting `.webp`, `.svg`, `.png`, `.jpeg`, `.jpg`, `.gif`, `.heic`, `.heif`, `.avif`, `.bmp`, `.ico`.
  * **10MB Max File Size Validation**: Instant error alert if file size exceeds 10MB limit.
  * Direct dual-collection sync across `talents` and `users` Firestore collections.
* **Multi-Location Coverage Selection**:
  * Assign multiple coverage cities/regions to a single talent.
* **Categories & Specialty Assignment**:
  * Multi-select services (e.g. Model, Actor, Host, Promoter, Brand Ambassador, Voice Actor).
* **Gender & Physical Specs Classification**:
  * Multi-select gender classification and physical attribute tracking (Height, Eye Color, Hair Color, Dress Size, Shoe Size).
* **Working Hours Configuration**:
  * Toggle between **24 Hours / Always Available** (24/7 booking availability) and **Custom Working Hours** (`Time From` -> `Time To` picker).
* **Blackout Dates & Calendar Availability**:
  * Add single-day or date-range blackouts with custom blackout reasons (e.g. Vacation, Sick Leave, Private Event).
* **Secondary Auth User Creation**:
  * Create talent login credentials directly from Admin Dashboard without logging out the active admin session.
* **Talent Status Toggle**:
  * One-click activate/inactivate talent profiles.

### C. Pending Talent Update Approval Center (`/pendingupdate`)
* Live notification badge when talents edit their profile details.
* Side-by-side diff comparison view highlighting changed fields (e.g. new bio, updated photos, modified username).
* Admin **Approve** or **Reject** actions with instant public profile sync upon approval.

### D. Booking Operations & Management
* **Status Filtering**: View bookings by `All`, `Pending`, `Confirmed`, `Completed`, `Cancelled`, or `In Progress`.
* **Manual Booking Creation**: Admin can create custom bookings on behalf of clients.
* **Talent Assignment & Conflict Check**:
  * Assign available talents or re-assign jobs with automatic blackout date & time conflict detection.
* **Booking Edit Controls**:
  * Modify event dates, times, locations, rates, client notes, and special instructions.
  * **Cancelled Booking Lock**: Automatic editing freeze and notification suppression for cancelled bookings.
* **Booking Cancellation Workflow**:
  * Cancel bookings with custom cancellation reasons and automated final notification alerts.
* **Admin Review & Rating System**:
  * Submit agency ratings and reviews for clients after job completion.

---

## 4. ⭐ Talent Portal (`/[companyId]/dashboard/talent`)

* **Personal Portal Dashboard**:
  * Overview of upcoming jobs, pending requests, total earnings, profile completion score, and quick link to public profile.
* **Profile Self-Management**:
  * Edit public display name, biography, physical specs, social media links, and coverage locations.
  * Upload profile picture and cover photos (`.webp`, `.png`, `.jpg`, etc., up to 10MB limit).
  * Build a **Portfolio Photo Gallery** (up to 10 high-resolution images).
  * Configure personal **Working Hours** (24 Hours vs Custom Time Ranges).
  * Manage personal **Blackout Dates** for vacation or unavailable days.
  * **Pending Approval Workflow**: Profile edits are submitted to Admin for approval while the old live profile remains publicly visible until approved.
* **Job & Booking Management**:
  * Accept or Decline incoming job requests.
  * Update job status: Mark job as `In Progress` or `Completed`.
  * View detailed event instructions: Event date, time, location map, dress code, client notes, and payout amount.
* **Direct Admin Chat**:
  * In-app live chat for each booking to communicate directly with agency staff.
* **Earnings & Payout History**:
  * Breakdown of completed jobs, pending payouts, and total historical earnings.

---

## 5. 💼 Client Portal (`/[companyId]/dashboard/client`)

* **Talent Search & Discovery**:
  * Search talent roster by keyword, filter by service category, location, gender, and working hours.
  * View talent profile cards with photo galleries, bio, specs, and star ratings.
* **Interactive Booking Builder**:
  * Step-by-step booking request wizard: Select talent, event date, start/end time, location, event description, and special requirements.
  * Automatic price calculation based on hourly or flat rates.
  * Real-time availability check against talent working hours and blackout dates.
* **Client Bookings Management**:
  * Track booking status in real-time (`Pending Approval`, `Confirmed`, `In Progress`, `Completed`, `Cancelled`).
  * Pay online via Stripe checkout or upload manual bank transfer receipts.
  * Submit reviews & star ratings for talents after job completion.
  * Live messaging with agency admins regarding booking details.

---

## 6. 🌐 Public Showcase & Guest Booking Flow

* **Public Talent Profile Page (`/[companyId]/talent/[username]`)**:
  * Publicly accessible, SEO-optimized profile showcase for each talent.
  * Shows photo gallery, public display name, physical specs, service categories, working hours, and rating summary.
  * Responsive layout tailored for mobile devices, social sharing, and embedding.
* **No-Login Guest Booking Checkout (`/[companyId]/book/[talentId]`)**:
  * Allows new or unregistered clients to book talent directly without prior registration.
  * **Step 1**: Event Details (Date, Start/End Time, Location, Event Type).
  * **Step 2**: Client Details (Full Name, Email, Phone, Company Name).
  * **Step 3**: Confirmation screen with instant booking tracking link.
* **Guest Payment Portal (`/[companyId]/guest/payment/[bookingId]`)**:
  * Secure, tokenized payment page allowing guest clients to complete Stripe payments or upload bank transfer receipts without signing in.
* **Automatic Client Account Provisions**:
  * System automatically registers guest clients into the agency database for seamless repeat bookings.

---

## 7. 📅 Availability & Working Hours Engine

* **24 Hours / Always Available Mode**:
  * Enables talents to be booked 24/7 without hourly restriction badges.
* **Custom Working Hours Mode**:
  * Precise `Time From` to `Time To` window (e.g. 09:00 AM to 05:00 PM).
* **Blackout Date Manager**:
  * Supports single blackout dates and multi-day date ranges.
  * Custom blackout reasons (e.g. "Personal Vacation", "Out of Town").
* **Smart Conflict Prevention**:
  * Prevents double bookings by validating new booking requests against existing confirmed bookings and blackout dates.

---

## 8. 📩 Multi-Channel Notification & Email System

* **Personalized Email Greetings**:
  * Dynamic user name resolution (`Hi Steve`, `Hi Kane Russo`) instead of generic `Hi User`.
  * Public display names used for talent notifications and real names for internal admin logs.
* **Automated Notification Triggers**:
  * **Talent Welcome & Verification**: Verification link email upon registration.
  * **Booking Requested**: Instant alert to Admin and Talent when a client submits a booking.
  * **Booking Confirmed**: Confirmation email with event details to Client and Talent.
  * **Booking Cancelled**: Final cancellation notification sent to Client, Talent, and Admin.
  * **Profile Update Status**: Email to Talent when profile update is approved or rejected.
* **Cancelled Booking Notification Suppression**:
  * Complete suppression of notification triggers once a booking is marked `Cancelled`.
* **SMS Notifications via Twilio**:
  * Automated SMS alerts for urgent booking updates and time-sensitive reminders.

---

## 9. 💳 Payments, Receipts & Financial Engine

* **Stripe Payment Gateway Integration**:
  * Online credit/debit card processing for instant booking payments.
  * Per-company Stripe key configuration (Live & Test mode support).
* **Manual Bank Transfer & QR Code Receipt Upload**:
  * Supports manual offline payments via direct bank transfer.
  * Admin can upload agency bank QR code and transfer instructions.
  * Client can upload payment proof images/PDF receipts.
  * Admin verification and receipt approval workflow.
* **Custom Commission & Payout Calculations**:
  * Automatic breakdown of gross booking amount, agency commission fee, and net talent payout.

---

## 10. 💬 Real-Time Chat & Audit Trail System

* **In-Booking Live Chat (`BookingChatModal`)**:
  * Real-time messaging modal attached to each booking.
  * Allows instant communication between Talent, Client, and Agency Admin.
* **Comprehensive Activity Timeline & Audit Logs**:
  * System logs every single status change, edit, payment upload, approval, and cancellation.
  * Records exact timestamp, actor UID, user role, and descriptive audit message.

---

## 11. 🔐 Security, Verification & Role Controls

* **Granular Role-Based Access Control (RBAC)**:
  * Strict separation between `platform_admin`, `company_admin`, `staff`, `talent`, and `client`.
* **Firebase Auth & Email Verification**:
  * Secure email/password authentication backed by Firebase Auth.
  * Email verification enforcement for new talent and agency registrations.
* **Directory Traversal & Path Security**:
  * File serving endpoint (`/api/files/...`) equipped with path sanitization preventing directory traversal attacks.
* **Form Validation & Input Sanitization**:
  * Full sanitization of usernames, public slugs, numeric inputs, and uploaded file types.

---

*Document compiled and maintained by the Talentum Engineering Team.*
