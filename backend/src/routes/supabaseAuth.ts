// backend/routes/supabaseAuth.ts

import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "User registered, check your email.", data });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  // data.session.access_token
  res.json({ access_token: data.session.access_token });
});

export default router;