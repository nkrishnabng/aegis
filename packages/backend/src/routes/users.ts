import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { createUser, listUsers, updateUser } from "../db/userRepo";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only an admin can view the user list." });
    return;
  }
  res.json(await listUsers());
});

const createUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["admin", "member"]).default("member"),
});

usersRouter.post("/", async (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only an admin can add teammates." });
    return;
  }
  const body = createUserSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { username: body.data.username } });
  if (existing) {
    res.status(409).json({ error: "That username is already taken." });
    return;
  }
  const user = await createUser(body.data.username, body.data.password, body.data.role);
  res.status(201).json(user);
});

const updateUserSchema = z
  .object({
    password: z.string().min(6).optional(),
    role: z.enum(["admin", "member"]).optional(),
  })
  .refine((data) => data.password !== undefined || data.role !== undefined, {
    message: "Provide a password and/or role to update.",
  });

usersRouter.put("/:id", async (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only an admin can edit teammates." });
    return;
  }
  const body = updateUserSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (req.params.id === req.user.id && body.data.role === "member") {
    res.status(400).json({ error: "You can't remove your own admin access." });
    return;
  }
  const updated = await updateUser(req.params.id, body.data);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(updated);
});
