import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { BrowserScene } from './scenes/BrowserScene';
import { UITitle } from './scenes/UITitle';
import { UIMontage } from './scenes/UIMontage';
import { UIOutro } from './scenes/UIOutro';
import './index.css';

// Scene layout (30 fps):
//   0– 90  Title card
//  90–330  Home
// 330–540  StepUp Scholars
// 540–750  Dynamerge
// 750–990  Community montage (events / blog / stay-connected)
// 990–1170 Signup
// 1170–1350 Outro

export const UIDemoComposition = () => {
  return (
    <>
      {/* Music bed: Kevin MacLeod — "Wholesome" (incompetech.com), CC BY 4.0 */}
      <Audio
        src={staticFile('audio.mp3')}
        volume={(f) =>
          interpolate(f, [0, 30, 1280, 1345], [0, 0.55, 0.55, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      {/* Whoosh at every scene cut, chime as the outro card lands */}
      {[90, 330, 540, 750, 990].map((f) => (
        <Sequence key={f} from={f}>
          <Audio src={staticFile('sfx_whoosh.wav')} volume={0.45} />
        </Sequence>
      ))}
      <Sequence from={1190}>
        <Audio src={staticFile('sfx_chime.wav')} volume={0.45} />
      </Sequence>

      <Sequence from={0} durationInFrames={90}>
        <UITitle durationInFrames={90} />
      </Sequence>

      <Sequence from={90} durationInFrames={240}>
        <BrowserScene
          src="staija_ui_home.png"
          imgWidth={2560}
          imgHeight={4666}
          urlPath="/"
          eyebrow="01 — HOME"
          heading={<>One front door.</>}
          blurb="Programs, stories, and a pan-African community of practice — from the first scroll."
          durationInFrames={240}
        />
      </Sequence>

      <Sequence from={330} durationInFrames={210}>
        <BrowserScene
          src="staija_ui_programs_stepup_scholars.png"
          imgWidth={2560}
          imgHeight={9994}
          urlPath="/programs/stepup-scholars"
          eyebrow="02 — PROGRAMS"
          heading={<>StepUp Scholars.</>}
          blurb="A Nigeria-based research incubator: world-class labs, a monthly stipend, and your first published paper."
          durationInFrames={210}
        />
      </Sequence>

      <Sequence from={540} durationInFrames={210}>
        <BrowserScene
          src="staija_ui_programs_dynamerge.png"
          imgWidth={2560}
          imgHeight={10046}
          urlPath="/programs/dynamerge"
          eyebrow="02 — PROGRAMS"
          heading={<>Dynamerge.</>}
          blurb="A pan-African virtual summer bootcamp — four weeks of intense learning with global mentors."
          durationInFrames={210}
        />
      </Sequence>

      <Sequence from={750} durationInFrames={240}>
        <UIMontage durationInFrames={240} />
      </Sequence>

      <Sequence from={990} durationInFrames={180}>
        <BrowserScene
          src="staija_ui_signup.png"
          imgWidth={2560}
          imgHeight={3200}
          urlPath="/signup"
          eyebrow="04 — ACCOUNT"
          heading={<>Join in minutes.</>}
          blurb="Create an account to apply to programs, save your progress, and join the community."
          durationInFrames={180}
        />
      </Sequence>

      <Sequence from={1170} durationInFrames={180}>
        <UIOutro />
      </Sequence>
    </>
  );
};
