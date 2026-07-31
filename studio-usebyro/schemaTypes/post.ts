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
  ],
  orderings: [{title: 'Published', name: 'publishedAt', by: [{field: 'publishedAt', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'publishedAt', media: 'coverImage'}},
})
