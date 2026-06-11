import { redirect } from "next/navigation";

export default function SignupPage(): never {
  redirect("/?mode=signup");
}
