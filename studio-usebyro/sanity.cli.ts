import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'r5lpxbxj',
    dataset: 'production'
  },
  // Live at https://usebyro.sanity.studio
  studioHost: 'usebyro',
  deployment: {
    appId: 'h9rd7vil03w0sgqdbc5n3waz',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
})
