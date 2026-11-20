import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Preview
          </Badge>
          <CardTitle>Conversational AI</CardTitle>
          <CardDescription>
            The new Next.js app is running. Login, organization switching and
            chat are coming next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Sign in (coming soon)</Button>
        </CardContent>
      </Card>
    </main>
  );
}
