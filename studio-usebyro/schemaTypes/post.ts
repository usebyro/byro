import {defineType, defineField} from 'sanity'

export const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}, validation: (r) => r.required()}),
    defineField({name: 'excerpt', type: 'text', rows: 3}),
    defineField({name: 'body', type: 'array', of: [{type: 'block'}]}),
    defineField({name: 'coverImage', type: 'image', options: {hotspot: true}}),
    defineField({name: 'publishedAt', type: 'datetime'}),
    defineField({name: 'readTime', type: 'string', title: 'Read time (e.g. "4 min")'}),
    defineField({
      name: 'category',
      type: 'string',
      options: {
        list: [
          {title: 'For organizers', value: 'for-organizers'},
          {title: 'Music', value: 'music'},
          {title: 'Nightlife', value: 'nightlife'},
          {title: 'Sports', value: 'sports'},
          {title: 'Product', value: 'product'},
        ],
      },
    }),
    defineField({name: 'featured', type: 'boolean', initialValue: false}),
    defineField({name: 'authorName', type: 'string'}),
    defineField({name: 'authorInitials', type: 'string', title: 'Author initials (e.g. "AO")'}),
  ],
  orderings: [{title: 'Published', name: 'publishedAt', by: [{field: 'publishedAt', direction: 'desc'}]}],
  preview: {
    select: {title: 'title', subtitle: 'publishedAt', media: 'coverImage'},
  },
})
