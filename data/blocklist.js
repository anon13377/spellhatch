// Shared child-safety blocklist (owned by W1-H, read by W1-C distractors and any UI that shows generated text).
// Words here are NEVER shown as a generated distractor, even when they are not in DICT.
// Seeded by the orchestrator from the G1 W1-H findings; W1-H extended it in fix pass 1.
// Rule: no bundled list word may appear here (tests/W1-H.safety.test.mjs checks this).
const WORDS = `
anal anus arse arses arsehole ass asses asshole assholes ballsack balls bastard bastards bitch bitches bitchy blowjob bollocks bonk boner
boob boobs boobie boobies booty bugger bum bums butt butts buttock buttocks clit clits cock cocks coon coons crap craps crappy cum cums cumming cumshot
cunt cunts damn damned dammit dang dick dicks dickhead dildo dildos dike douche douchebag dyke fag fags faggot faggots fanny fap farted fart farts
fck fcuk feck fook frig fuc fuck fucked fucker fuckers fucking fuckin fucks fuk fuker fuq fvck genital genitals ghetto gimp git gits gook gooks
hell hells hoe hoes homo homos hooker horny hump humped jackass jap jerkoff jism jizz kike kikes knob knobs lez lesbo milf minge mofo mong
muff nad nads negro nigga niggas nigger niggers nude nudes nudity nutsack orgy paedo paki pecker pedo penis perv pervert phuck pimp
pee peed peeing piss pissed pisses pissing pissy poo poop pooped pooping poops porn porno prick pricks pube pubes pussy pussies queer rape raped
rapes rapist retard retarded rimjob schlong scrote semen sex sexed sexual sexy sext shag shat shit shite shits shitty shithead shitting
bullshit horseshit dipshit dumbass skank skanks slag slags slut sluts slutty smut spaz spazz spic spunk stfu tard tit tits titty tosser tranny
turd turds twat twats vag vagina vape vaped vapes vaping viagra wank wanker wankers wazzock wee weed weeds weenie whore whores willy wang wop xxx yid
ffs fml lmao lmfao wtf wth omfg
meth methhead crack cocaine heroin weed dope drugs ganja bong bongs spliff lsd mdma opium stoned stoner booze drunk vodka whisky
kill kills killed killer murder suicide incest molest nazi nazis hitler kkk isis
jew jews cooch cooche coochie coochy spik spick spicke spics peen peeno peenie shart sharts coont coonts cume cump cumm harse narse nigg niger niggah nigguh negros wetback beaner chink chinks gypsy gypsies paki pakis raghead towelhead sandnigger kyke hebe heeb tranny shemale fagot faggit fagg dyke dykes lezzie lezbo skeet skeets queef queers cunnilingus fellatio masturbate masturbation orgasm erection ejaculate clitoris vulva scrotum testicle testicles nipple nipples tampon tampons turds poopy peepee peepees pissoff shitter wanky wanking tosspot arsed arses bellend bellends bloody bugger buggered rimming felch fisting gangbang creampie handjob cumslut slutty whorish hoer hoar hore skank strumpet trollop jerk jerking jacking jackoff beastiality bestiality pedophile paedophile pedofile groper
spac spack spacker spakker juw siks weeb fanni poot cokie
`;
export const BLOCKED = new Set(WORDS.split(/\s+/).filter(Boolean));
