import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// What we do to protect a repairer's data, in plain language.
//
// EVERY CLAIM ON THIS PAGE IS TRUE OF THE CODE AS IT STANDS. This is shown to
// customers who are nervous about data security, so it is a promise, not
// marketing. Before adding a line here, check the code does it. Before REMOVING
// a protection from the code, remove the line here in the same commit.
//
// Deliberately absent, because they are not true today: any claim of an
// independent audit or penetration test, any certification (ISO, SOC 2, PCI),
// and any claim that Preview and Production are separate databases.
// ---------------------------------------------------------------------------

type Measure = { title: string; body: string };

const ACCOUNT: Measure[] = [
  {
    title: "Passwords are never stored",
    body: "We keep a bcrypt hash, not your password. Nobody at Price my Prang can read it, and a stolen copy of our database would not hand anyone your login.",
  },
  {
    title: "Confirmed email addresses",
    body: "A new sign-up has to click a link we email before the account can be used. That stops somebody registering a workshop under an address that isn't theirs.",
  },
  {
    title: "Optional two-step sign-in",
    body: "Turn it on and signing in also needs a 6-digit code emailed to you. Someone who learns your password still can't get in without your inbox. The code is stored hashed, expires in 10 minutes, and stops working after five wrong guesses.",
  },
  {
    title: "Limited sign-in attempts",
    body: "Repeated failed logins are throttled, both per account and per source, so nobody can sit and work through a list of passwords.",
  },
  {
    title: "Temporary passwords must be replaced",
    body: "Any password we generate for you works once. The portal shows nothing but the change-password screen until you've chosen your own.",
  },
];

const DATA: Measure[] = [
  {
    title: "Your workshop's data is walled off from every other workshop",
    body: "Suppliers, rates, quotes, team and complaints are all scoped to your workshop by the account you signed in with — never by anything in the web address. We test this: a second workshop attempting to read, change or delete your records is refused.",
  },
  {
    title: "A refusal looks like 'not found'",
    body: "Asking for another workshop's record returns 'not found' rather than 'not allowed'. 'Not allowed' would confirm the record exists, which is itself a way of learning about your business.",
  },
  {
    title: "Photographs and documents are stored privately",
    body: "Vehicle photos, licence discs, warranty certificates and quote PDFs are held in private storage with no public web address. They are served only through our own gateway, which checks who is asking.",
  },
  {
    title: "Roles decide what each of your people can do",
    body: "Your admin, estimators and buyers each see only what their role allows. You can see exactly what every role can do on the Roles page.",
  },
  {
    title: "Only you can add your own team",
    body: "A workshop admin creating a user can only place them in your workshop and only assign workshop roles — enforced on our servers, not just hidden in the screen.",
  },
];

const PLATFORM: Measure[] = [
  {
    title: "Encrypted in transit",
    body: "Every connection is HTTPS, and browsers are instructed to refuse an unencrypted one. Session cookies cannot be read by scripts and are never sent over plain HTTP.",
  },
  {
    title: "Managed, backed-up database",
    body: "Records are held in a managed Postgres database (Neon) rather than on a machine in an office, with the provider's encryption at rest and point-in-time recovery.",
  },
  {
    title: "Third-party keys are encrypted",
    body: "Credentials for outside services we use on your behalf are encrypted before they are stored, so they are unreadable even to anything querying the database directly.",
  },
  {
    title: "Customers get unguessable links, not guessable ones",
    body: "Anything a consumer opens without logging in — their quotes, a feedback form — is reached by a random one-time link, never by a job number that could be guessed.",
  },
];

const CONSUMER: Measure[] = [
  {
    title: "We collect what a quote needs, and no more",
    body: "Name, contact details, the vehicle, and photographs of the damage. We don't ask for identity numbers or banking details, and we never ask anyone for a password.",
  },
  {
    title: "You see only your own jobs",
    body: "A workshop sees the customers and vehicles on jobs sent to it. You cannot browse the customer base, and a competitor cannot see yours.",
  },
  {
    title: "Complaints are private",
    body: "A complaint goes to Price my Prang and to the workshop named in it. It is never published. Star ratings and their comments are public — a complaint is not a review.",
  },
  {
    title: "Notes we keep to ourselves stay that way",
    body: "Where we record our own view of a dispute, that note is marked internal and is not shown to the workshop.",
  },
];

function Section({
  heading,
  intro,
  items,
  accent,
}: {
  heading: string;
  intro: string;
  items: Measure[];
  accent: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <div className={`mb-3 h-1 w-14 rounded-full ${accent}`} />
        <h2 className="font-display text-xl font-bold text-ink">{heading}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">{intro}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((m) => (
          <div key={m.title} className="pmp-card p-5">
            <h3 className="font-display text-base font-semibold text-ink">{m.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">{m.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function SecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">How we protect your data</h1>
        <p className="mt-2 max-w-2xl text-ink/60">
          Your rate cards, your suppliers and your customers are commercially sensitive — they
          say who you buy from and what you charge. Here is exactly what stands between that
          information and anybody else. No jargon, and nothing on this page that we don&apos;t
          actually do.
        </p>
      </div>

      {/* The one-line version, for anyone who reads nothing else. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { n: "Your data", d: "Visible to your workshop only. Never to another repairer." },
          { n: "Your account", d: "Hashed passwords, confirmed email, optional 2-step sign-in." },
          { n: "Your files", d: "Private storage. No public web address, ever." },
        ].map((c) => (
          <div key={c.n} className="pmp-card p-5">
            <p className="font-display text-base font-bold text-ink">{c.n}</p>
            <p className="mt-1 text-sm text-ink/60">{c.d}</p>
          </div>
        ))}
      </div>

      <Section
        heading="Getting into your account"
        intro="Most breaches start with a stolen password rather than anything clever."
        items={ACCOUNT}
        accent="bg-teal"
      />
      <Section
        heading="Keeping your workshop's data yours"
        intro="The question repairers actually ask: can another workshop see my rates and my suppliers?"
        items={DATA}
        accent="bg-coral"
      />
      <Section
        heading="Where it all lives"
        intro="How the information is carried and stored."
        items={PLATFORM}
        accent="bg-amber"
      />
      <Section
        heading="Your customers' information"
        intro="Their data is our responsibility too, and how we treat it affects you."
        items={CONSUMER}
        accent="bg-teal-light"
      />

      <section className="pmp-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">What we don&apos;t claim</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
          We have not been independently audited or penetration-tested, and we hold no security
          certification. We would rather tell you that than imply otherwise. If something on this
          page ever stops being true, it comes off the page.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
          Found something that worries you, or think you&apos;ve spotted a weakness? Tell us
          before you tell anyone else and we will fix it.
        </p>
      </section>
    </div>
  );
}
